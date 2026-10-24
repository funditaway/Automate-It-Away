#!/usr/bin/env node
require("./_env-guard");
// Proves the one-time old-upload move: owner seat + confirm, dry-run default,
// copy/head/del against the mock Blob store, verify-before-relink, HTML flagged,
// delete only after James's Yes. No token or pin in output or in a URL.
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const PIN = "4821";
const HELPER = "9797";
const WAIT_PIN = "1111";
const TOKEN = "vercel_blob_rw_FAKESTORE_fakefakefake";
const CONFIRM = "move-old-uploads";

function fail(msg) {
  console.error("FAIL " + scrub(msg));
  process.exit(1);
}
function pass(msg) { console.log("ok  " + scrub(msg)); }
function scrub(msg) {
  return String(msg || "")
    .split(PIN).join("[pin]")
    .split(HELPER).join("[pin]")
    .split(WAIT_PIN).join("[pin]")
    .replace(/vercel_blob_rw_[A-Za-z0-9_]+/g, "[token]");
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function assertSources() {
  const lib = read("api/_lib.js");
  const upload = read("api/upload.js");
  const mig = read("api/migrate-uploads.js");
  if (!/async function blobCopy\(/.test(lib)) fail("copy helper missing");
  if (!/async function blobHead\(/.test(lib)) fail("head helper missing");
  if (!/async function blobDel\(/.test(lib)) fail("del helper missing");
  if (lib.indexOf("blobCopy, blobHead, blobDel") < 0) fail("copy/head/del must be exported");
  const putOpts = lib.slice(lib.indexOf("function blobPutOpts"), lib.indexOf("function blobOpts"));
  if (putOpts.indexOf("addRandomSuffix: false") < 0) fail("store put() must still refuse a random suffix");
  if (!/function blobPut\(/.test(lib) || lib.indexOf("put(BLOB_KEY, body, blobPutOpts") < 0) fail("store put() must still write the live key");
  if (upload.indexOf("addRandomSuffix: true") < 0 || upload.indexOf("allowOverwrite: false") < 0) fail("upload put() must stay random and not overwrite");
  const move = mig.slice(mig.indexOf("async function moveOld"), mig.indexOf("async function deleteOld"));
  const delFn = mig.slice(mig.indexOf("async function deleteOld"), mig.indexOf("module.exports = async function handler"));
  if (move.indexOf("blobDel") >= 0) fail("dry-run and apply must not call del");
  if (delFn.indexOf("blobDel") < 0) fail("delete action must call del");
  if (delFn.indexOf('confirmDelete !== CONFIRM_DELETE') < 0) fail("delete needs its own confirm");
  if (mig.indexOf("keepOriginalTypes") < 0) fail("keepOriginalTypes option missing");
  if (mig.indexOf("storedType") < 0 && move.indexOf("chooseType") < 0) fail("stored type option missing");
  if (mig.indexOf("deskSeat") < 0 || mig.indexOf("isOwner") < 0) fail("move must use deskSeat and isOwner");
  if (/\bpersonOf\b/.test(mig)) fail("move must use deskSeat");
  if (/require\(\s*["']\.\/jobs["']\s*\)/.test(mig) || /require\(\s*["']\.\/hook["']\s*\)/.test(mig)) fail("move must not load jobs or hook");
  if (mig.indexOf('body.apply === true') < 0) fail("apply must be an explicit boolean");
  if (mig.indexOf("mem.money") >= 0 || mig.indexOf("charged") >= 0) fail("move must not touch charge paths");
  const pkg = read("package.json");
  if (pkg.indexOf("scripts/check-upload-migrate.js") < 0) fail("package.json must run check-upload-migrate");
  if (pkg.indexOf("scripts/check-upload-privacy.js") < 0 || pkg.indexOf("scripts/check-store-guard.js") < 0) fail("package.json must keep the existing checks");
  pass("source keeps put(), gates the move, and leaves Collect alone");
}

function spawnChild(scenario, apiDir, envExtra) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aia-mig-"));
  const env = Object.assign({
    PATH: process.env.PATH,
    HOME: tmp,
    AIA_STORE_PATH: path.join(tmp, "store.json"),
    AIA_UPLOAD_DIR: path.join(tmp, "up"),
    VERCEL_ENV: "production",
    BLOB_READ_WRITE_TOKEN: TOKEN,
    BLOB_STORE_ID: "store_FAKESTORE",
    AIA_CHECK_PARENT: String(process.pid)
  }, envExtra || {});
  const r = spawnSync(process.execPath, [__filename, "--child", scenario, apiDir || path.join(root, "api")], {
    env: env,
    cwd: tmp,
    encoding: "utf8",
    timeout: 60000
  });
  fs.rmSync(tmp, { recursive: true, force: true });
  const blob = String(r.stdout || "") + "\n" + String(r.stderr || "");
  if (blob.indexOf(PIN) >= 0 || blob.indexOf(HELPER) >= 0 || blob.indexOf(WAIT_PIN) >= 0 || blob.indexOf(TOKEN) >= 0) {
    return { leak: true, error: "child output contained a pin or token", status: r.status, checks: [] };
  }
  const line = String(r.stdout || "").split("\n").find((l) => l.indexOf("RESULT ") === 0);
  if (!line) return { error: "no result (exit " + r.status + "): " + scrub(String(r.stderr || "").slice(-500)), checks: [] };
  try { return JSON.parse(line.slice(7)); } catch (e) { return { error: "bad result json", checks: [] }; }
}

function judge(out, label) {
  if (out.leak) fail(label + " leaked a pin or token into output");
  if (out.error) fail(label + " " + out.error);
  const bad = (out.checks || []).filter((c) => !c.ok);
  if (bad.length) fail(label + " " + bad.map((c) => c.name + (c.detail ? " (" + c.detail + ")" : "")).join("; "));
  pass(label);
}

function pngBytes(n) {
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), Buffer.from("png" + n)]);
}
function jpegBytes() {
  return Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00]);
}
function gifBytes() {
  return Buffer.concat([Buffer.from("GIF89a", "ascii"), Buffer.from("gifimg")]);
}
function webpBytes() {
  const buf = Buffer.alloc(16);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(8, 4);
  buf.write("WEBP", 8, "ascii");
  return buf;
}
function pdfBytes() { return Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n"); }
function htmlBytes() { return Buffer.from("<!DOCTYPE html><html><body>old</body></html>"); }
function textBytes() { return Buffer.from("plain note"); }

function installMock(Module) {
  const fake = {
    files: Object.create(null),
    types: Object.create(null),
    auths: [],
    copies: [],
    dels: [],
    puts: [],
    publicGets: [],
    authedPublic: 0,
    restWrites: 0,
    sdkCalls: 0,
    failStoreId: false,
    sdkDown: false,
    corruptNew: false
  };
  function pathFrom(u) {
    const s = String(u || "");
    if (!/^https?:/i.test(s)) return s.replace(/^\/+/, "");
    const parsed = new URL(s);
    const q = parsed.searchParams.get("pathname");
    if (q) return q;
    return decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  }
  function publicUrl(pathname) {
    return "https://store_FAKESTORE.public.blob.vercel-storage.com/" + pathname;
  }
  function noteAuth(opts) {
    fake.sdkCalls += 1;
    const kind = opts && opts.token ? "token" : (opts && opts.storeId ? "storeId" : "none");
    fake.auths.push(kind);
    if (fake.sdkDown) throw new Error("Vercel Blob: No blob credentials found.");
    if (fake.failStoreId && opts && opts.storeId) throw new Error("unable to extract store id");
  }
  function oldPath(pathname) {
    return /^[^/]+\/file_[0-9a-z]+\.[a-z0-9]+$/.test(pathname);
  }
  const orig = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === "@vercel/blob") {
      return {
        async get(key, opts) {
          noteAuth(opts);
          const pathname = pathFrom(key);
          const raw = fake.files[pathname];
          if (!raw) throw new Error("Vercel Blob: The requested blob does not exist");
          const text = Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw);
          return { statusCode: 200, stream: { text: async () => text }, blob: { url: publicUrl(pathname) } };
        },
        async head(key, opts) {
          noteAuth(opts);
          const pathname = pathFrom(key);
          const raw = fake.files[pathname];
          if (!raw) throw new Error("Vercel Blob: The requested blob does not exist");
          const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw));
          return { pathname: pathname, url: publicUrl(pathname), size: buf.length, contentType: fake.types[pathname] || "application/octet-stream" };
        },
        async put(key, body, opts) {
          noteAuth(opts);
          const suffix = opts && opts.addRandomSuffix ? "-" + crypto.randomBytes(4).toString("hex") : "";
          const pathname = String(key) + suffix;
          const buf = Buffer.isBuffer(body) ? Buffer.from(body) : Buffer.from(String(body));
          fake.files[pathname] = buf;
          fake.types[pathname] = (opts && opts.contentType) || "application/octet-stream";
          fake.puts.push({ pathname: pathname, addRandomSuffix: !!(opts && opts.addRandomSuffix), contentType: fake.types[pathname] });
          return { url: publicUrl(pathname), pathname: pathname, contentType: fake.types[pathname], size: buf.length };
        },
        async del(key, opts) {
          noteAuth(opts);
          const pathname = pathFrom(key);
          fake.dels.push(pathname);
          delete fake.files[pathname];
          delete fake.types[pathname];
        },
        async list(opts) {
          noteAuth(opts);
          const blobs = Object.keys(fake.files).map((p) => ({
            pathname: p,
            url: publicUrl(p),
            size: Buffer.isBuffer(fake.files[p]) ? fake.files[p].length : Buffer.byteLength(String(fake.files[p])),
            contentType: fake.types[p] || "application/octet-stream"
          }));
          return { blobs: blobs, hasMore: false };
        },
        async copy(fromUrl, toPathname, opts) {
          noteAuth(opts);
          const from = pathFrom(fromUrl);
          const src = fake.files[from];
          if (!src) throw new Error("Vercel Blob: The requested blob does not exist");
          const suffix = opts && opts.addRandomSuffix ? "-" + crypto.randomBytes(4).toString("hex") : "";
          const pathname = String(toPathname) + suffix;
          const buf = Buffer.isBuffer(src) ? Buffer.from(src) : Buffer.from(String(src));
          fake.files[pathname] = buf;
          fake.types[pathname] = (opts && opts.contentType) || "application/octet-stream";
          fake.copies.push({
            from: from,
            pathname: pathname,
            contentType: fake.types[pathname],
            addRandomSuffix: !!(opts && opts.addRandomSuffix),
            allowOverwrite: opts && opts.allowOverwrite,
            access: opts && opts.access,
            auth: opts && opts.token ? "token" : (opts && opts.storeId ? "storeId" : "none")
          });
          return { url: publicUrl(pathname), pathname: pathname, contentType: fake.types[pathname], size: buf.length };
        }
      };
    }
    return orig.apply(this, arguments);
  };
  global.fetch = async function (url, opts) {
    const u = String(url || "");
    const method = String((opts && opts.method) || "GET").toUpperCase();
    const headers = (opts && opts.headers) || {};
    const auth = headers.Authorization || headers.authorization || "";
    const blobish = u.indexOf("blob.vercel-storage.com") >= 0 || u.indexOf("vercel.com/api/blob") >= 0;
    if (!blobish) {
      return { ok: false, status: 404, headers: { get: () => null }, text: async () => "", arrayBuffer: async () => Buffer.alloc(0) };
    }
    if (method === "GET" && !auth) {
      const pathname = pathFrom(u);
      fake.publicGets.push(pathname);
      let raw = fake.files[pathname];
      if (!raw) return { ok: false, status: 404, headers: { get: () => null }, text: async () => "", arrayBuffer: async () => Buffer.alloc(0) };
      let buf = Buffer.isBuffer(raw) ? Buffer.from(raw) : Buffer.from(String(raw));
      if (fake.corruptNew && !oldPath(pathname)) buf = Buffer.concat([buf, Buffer.from("X")]);
      const type = fake.types[pathname] || "application/octet-stream";
      return {
        ok: true,
        status: 200,
        headers: { get: (k) => (String(k).toLowerCase() === "content-type" ? type : (String(k).toLowerCase() === "content-length" ? String(buf.length) : null)) },
        text: async () => buf.toString("utf8"),
        arrayBuffer: async () => buf
      };
    }
    if (method === "GET" && auth) fake.authedPublic += 1;
    if (method === "PUT" || method === "POST") {
      fake.restWrites += 1;
      const parsed = new URL(u);
      const from = parsed.searchParams.get("fromUrl");
      const pathname = parsed.searchParams.get("pathname") || pathFrom(u);
      if (from) {
        const src = fake.files[pathFrom(from)];
        if (!src) return { ok: false, status: 404, text: async () => "{\"error\":\"missing\"}", headers: { get: () => null } };
        const suffix = (headers["x-add-random-suffix"] === "1" || headers["x-add-random-suffix"] === "true") ? "-" + crypto.randomBytes(3).toString("hex") : "";
        const dest = pathname + suffix;
        const buf = Buffer.isBuffer(src) ? Buffer.from(src) : Buffer.from(String(src));
        fake.files[dest] = buf;
        const type = headers["x-content-type"] || "application/octet-stream";
        fake.types[dest] = type;
        fake.copies.push({ from: pathFrom(from), pathname: dest, contentType: type, addRandomSuffix: !!suffix, allowOverwrite: false, access: "public", auth: "rest" });
        return { ok: true, status: 200, text: async () => JSON.stringify({ url: publicUrl(dest), pathname: dest, contentType: type, size: buf.length }), headers: { get: () => "application/json" } };
      }
      if (u.indexOf("/delete") >= 0) {
        let urls = [];
        try { urls = JSON.parse(String((opts && opts.body) || "{}")).urls || []; } catch (e) { urls = []; }
        urls.forEach((one) => { const p = pathFrom(one); fake.dels.push(p); delete fake.files[p]; delete fake.types[p]; });
        return { ok: true, status: 200, text: async () => "{}", headers: { get: () => null } };
      }
      const body = opts && opts.body;
      const buf = Buffer.isBuffer(body) ? Buffer.from(body) : Buffer.from(String(body || ""));
      fake.files[pathname] = buf;
      fake.types[pathname] = headers["x-content-type"] || "application/json";
      fake.puts.push({ pathname: pathname, addRandomSuffix: headers["x-add-random-suffix"] === "1", contentType: fake.types[pathname] });
      return { ok: true, status: 200, text: async () => JSON.stringify({ url: publicUrl(pathname), pathname: pathname }), headers: { get: () => null } };
    }
    const pathname = pathFrom(u);
    if (!fake.files[pathname]) return { ok: false, status: 404, text: async () => "", headers: { get: () => null }, arrayBuffer: async () => Buffer.alloc(0) };
    const raw = fake.files[pathname];
    const text = Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw);
    return { ok: true, status: 200, text: async () => text, headers: { get: () => null }, arrayBuffer: async () => Buffer.from(text) };
  };
  return { fake: fake, publicUrl: publicUrl, pathFrom: pathFrom };
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
    end(b) { if (b !== undefined && this.body == null) this.body = b; return this; }
  };
}

async function call(handler, method, headers, body) {
  const res = mockRes();
  await handler({ method: method, headers: headers || {}, body: body || {}, query: {} }, res);
  return res;
}

function childSecrets(sessionToken) {
  return [PIN, HELPER, WAIT_PIN, TOKEN, sessionToken || ""].filter(Boolean);
}

function leaked(value, secrets) {
  const s = JSON.stringify(value == null ? "" : value);
  return secrets.some((sec) => sec && s.indexOf(sec) >= 0);
}

async function childFlow(apiDir) {
  const Module = require("module");
  const mock = installMock(Module);
  const fake = mock.fake;
  const lib = require(path.join(apiDir, "_lib.js"));
  const auth = require(path.join(apiDir, "auth.js"));
  const mig = require(path.join(apiDir, "migrate-uploads.js"));
  await lib.ready();
  const checks = [];
  function check(name, ok, detail) {
    checks.push({ name: name, ok: !!ok, detail: ok ? "" : scrub(detail) });
  }
  const slug = "springfield-shop";
  const opened = await call(auth, "POST", { "x-workspace": slug }, { action: "open", slug: slug, biz: "Springfield Shop", name: "James", pin: PIN });
  check("desk opens", opened.statusCode === 201, String(opened.statusCode));
  const invited = await call(auth, "POST", { "x-workspace": slug, "x-pin": PIN }, { action: "invite", name: "Pat", pin: HELPER, kind: "helper" });
  check("helper invited", invited.statusCode === 201 || invited.statusCode === 202, String(invited.statusCode));
  const login = await call(auth, "POST", { "x-workspace": slug }, { action: "login", workspace: slug, pin: PIN });
  const sessionToken = login.body && login.body.session && login.body.session.token || "";
  check("owner session", login.statusCode === 200 && !!sessionToken, String(login.statusCode));
  const secrets = childSecrets(sessionToken);
  const row = lib.mem.workspaces.find((w) => w && w.slug === slug);
  row.people.push({ id: "p_wait", name: "Wait", role: "employee", kind: "helper", status: "pending", pin: lib.hashPin(WAIT_PIN) });

  const stamp = Date.now().toString(36);
  const specs = [
    { key: "shared", ext: "png", type: "image/png", bytes: pngBytes("a"), jobs: ["job_a", "job_b"], field: "photo" },
    { key: "html", ext: "html", type: "text/html", bytes: htmlBytes(), jobs: ["job_c"], field: "photo" },
    { key: "jpeg", ext: "jpg", type: "image/jpeg", bytes: jpegBytes(), jobs: ["job_d"], field: "photo" },
    { key: "gif", ext: "gif", type: "image/gif", bytes: gifBytes(), jobs: ["job_d"], field: "file" },
    { key: "webp", ext: "webp", type: "image/webp", bytes: webpBytes(), jobs: ["job_e"], field: "file" },
    { key: "pdf", ext: "pdf", type: "application/pdf", bytes: pdfBytes(), jobs: ["job_f"], field: "file" },
    { key: "txt", ext: "txt", type: "text/plain", bytes: textBytes(), jobs: ["job_g"], field: "file" },
    { key: "png2", ext: "png", type: "image/png", bytes: pngBytes("b"), jobs: ["job_h"], field: "both" },
    { key: "png3", ext: "png", type: "image/png", bytes: pngBytes("c"), jobs: [], field: "none" }
  ];
  const jobs = {};
  ["job_a", "job_b", "job_c", "job_d", "job_e", "job_f", "job_g", "job_h", "job_mig"].forEach((id) => {
    jobs[id] = { id: id, workspace: slug, title: id === "job_mig" ? "Move 9 old uploads" : id, photoUrl: "", files: [], log: [], thread: [], charged: false, status: "waiting" };
  });
  const urls = {};
  specs.forEach((spec, i) => {
    const pathname = slug + "/file_" + stamp + i + "." + spec.ext;
    const url = mock.publicUrl(pathname);
    urls[spec.key] = url;
    fake.files[pathname] = Buffer.from(spec.bytes);
    fake.types[pathname] = spec.type;
    lib.mem.files.push({
      id: "file_old" + i,
      workspace: slug,
      name: spec.key + "." + spec.ext,
      type: spec.type,
      bytes: spec.bytes.length,
      url: url,
      remoteUrl: url,
      driver: "blob"
    });
    spec.jobs.forEach((id) => {
      if (spec.field === "photo" || spec.field === "both") jobs[id].photoUrl = url;
      if (spec.field === "file" || spec.field === "both") {
        jobs[id].files.push({ id: "file_old" + i, name: spec.key, type: spec.type, url: url, photoUrl: spec.field === "both" ? url : "" });
      }
    });
  });
  jobs.job_f.notes = "see " + urls.pdf + " please";
  lib.mem.inbox.push({ id: "in_pdf", workspace: slug, text: urls.pdf });
  Object.keys(jobs).forEach((id) => lib.mem.jobs.push(jobs[id]));
  const moneyBefore = (lib.mem.money || []).length;
  await lib.save();

  function snap() {
    return JSON.stringify({
      files: lib.mem.files,
      jobs: lib.mem.jobs,
      inbox: lib.mem.inbox,
      migrations: lib.mem.migrations || null,
      money: lib.mem.money || [],
      keys: Object.keys(fake.files).sort(),
      dels: fake.dels.length,
      copies: fake.copies.length
    });
  }
  const owner = { "x-workspace": slug, "x-pin": PIN };
  const before = snap();
  function plainRefusal(body) {
    if (!body || typeof body !== "object") return false;
    const keys = Object.keys(body).sort().join(",");
    return keys === "driver,error,ok" && body.job == null && body.photoUrl == null && body.files == null;
  }
  const stranger = await call(mig, "POST", { "x-workspace": slug }, { confirm: CONFIRM, apply: true });
  check("stranger refused", stranger.statusCode === 401 && stranger.body && stranger.body.ok === false && stranger.body.error === "Desk code required." && plainRefusal(stranger.body), String(stranger.statusCode));
  const helper = await call(mig, "POST", { "x-workspace": slug, "x-pin": HELPER }, { confirm: CONFIRM, apply: true });
  check("non-owner refused", helper.statusCode === 403 && helper.body && helper.body.error === "Only the owner can move old uploads." && plainRefusal(helper.body), String(helper.statusCode) + " " + (helper.body && helper.body.error));
  const pending = await call(mig, "POST", { "x-workspace": slug, "x-pin": WAIT_PIN }, { confirm: CONFIRM });
  check("pending seat refused", pending.statusCode === 403 && pending.body && pending.body.error === "That seat is waiting on the owner." && plainRefusal(pending.body), String(pending.statusCode));
  const bad = await call(mig, "POST", owner, { confirm: "nope", apply: true });
  check("bad confirm refused", bad.statusCode === 403 && bad.body && bad.body.error === "That confirm phrase does not match.", String(bad.statusCode));
  const asString = await call(mig, "POST", owner, { confirm: CONFIRM, apply: "true", cardId: "job_mig" });
  check("string apply is dry run", asString.statusCode === 200 && asString.body && asString.body.dryRun === true && asString.body.apply === false, String(asString.statusCode));
  const bySession = await call(mig, "POST", { "x-workspace": slug, "x-session": sessionToken }, { confirm: CONFIRM, cardId: "job_mig" });
  check("session dry run", bySession.statusCode === 200 && bySession.body && bySession.body.dryRun === true, String(bySession.statusCode));
  const byCookie = await call(mig, "POST", { "x-workspace": slug, cookie: "aia_session=" + encodeURIComponent(sessionToken) }, { confirm: CONFIRM, cardId: "job_mig" });
  check("cookie dry run", byCookie.statusCode === 200 && byCookie.body && byCookie.body.dryRun === true && byCookie.body.count === 9, String(byCookie.statusCode) + " count " + (byCookie.body && byCookie.body.count));
  const dry = await call(mig, "POST", owner, { confirm: CONFIRM, cardId: "job_mig" });
  check("pin dry run", dry.statusCode === 200 && dry.body && dry.body.dryRun === true && dry.body.deleted === false && dry.body.mismatch === false, JSON.stringify(dry.body && { status: dry.statusCode, mismatch: dry.body && dry.body.mismatch, count: dry.body && dry.body.count, error: dry.body && dry.body.error }));
  const htmlItem = dry.body && (dry.body.items || []).find((item) => item.oldPath && item.oldPath.indexOf(".html") >= 0);
  const sharedItem = dry.body && (dry.body.items || []).find((item) => item.oldUrl === urls.shared);
  check("html flagged in dry run", !!(htmlItem && (htmlItem.plan === "flag" || htmlItem.plan === "flagged")), htmlItem && htmlItem.plan);
  check("shared file lists two cards", !!(sharedItem && sharedItem.cards && sharedItem.cards.length === 2), String(sharedItem && sharedItem.cards && sharedItem.cards.length));
  check("dry run changes nothing", snap() === before && fake.copies.length === 0 && fake.dels.length === 0, "copies " + fake.copies.length + " dels " + fake.dels.length);
  const earlyDelete = await call(mig, "POST", owner, { confirm: CONFIRM, action: "delete", confirmDelete: "yes", cardId: "job_mig" });
  check("delete before verify refused", earlyDelete.statusCode === 409 && earlyDelete.body && earlyDelete.body.ok === false, String(earlyDelete.statusCode) + " " + (earlyDelete.body && earlyDelete.body.error));
  check("early delete changes nothing", snap() === before && fake.dels.length === 0, "dels " + fake.dels.length);

  const extraPath = slug + "/file_" + stamp + "9.png";
  fake.files[extraPath] = Buffer.from(pngBytes("extra"));
  fake.types[extraPath] = "image/png";
  const mismatch = await call(mig, "POST", owner, { confirm: CONFIRM, apply: true, cardId: "job_mig" });
  check("count mismatch refuses apply", mismatch.statusCode === 409 && mismatch.body && mismatch.body.mismatch === true, String(mismatch.statusCode));
  delete fake.files[extraPath];
  check("mismatch changed nothing", fake.copies.length === 0 && fake.dels.length === 0 && lib.mem.files.some((f) => f && f.url === urls.shared), "copies " + fake.copies.length);

  const copiesBefore = fake.copies.length;
  const applied = await call(mig, "POST", owner, { confirm: CONFIRM, apply: true, cardId: "job_mig" });
  check("apply ok", applied.statusCode === 200 && applied.body && applied.body.ok === true && applied.body.apply === true && applied.body.deleted === false, String(applied.statusCode) + " " + (applied.body && applied.body.error));
  const newCopies = fake.copies.slice(copiesBefore);
  check("apply copies eight", newCopies.length === 8, String(newCopies.length));
  check("copies are public random suffix", newCopies.every((c) => c.addRandomSuffix === true && c.allowOverwrite === false && c.access === "public" && c.auth === "storeId"), JSON.stringify(newCopies.map((c) => ({ a: c.addRandomSuffix, o: c.allowOverwrite, s: c.access, auth: c.auth }))));
  check("new names are unguessable", newCopies.every((c) => /^[0-9a-f-]{36,}-[0-9a-f]+$/i.test(c.pathname) && c.pathname.indexOf(slug) < 0 && c.pathname.indexOf("file_") < 0), newCopies.map((c) => c.pathname).join(","));
  const pdfCopy = newCopies.find((c) => c.from.indexOf(".pdf") >= 0);
  const pngCopy = newCopies.find((c) => c.from.indexOf(stamp + "0.png") >= 0);
  check("pdf stored as octet-stream", !!(pdfCopy && pdfCopy.contentType === "application/octet-stream"), pdfCopy && pdfCopy.contentType);
  check("png stored as image/png", !!(pngCopy && pngCopy.contentType === "image/png"), pngCopy && pngCopy.contentType);
  check("old blobs remain", specs.every((spec) => fake.files[slug + "/file_" + stamp + specs.indexOf(spec) + "." + spec.ext]), "missing old");
  check("html blob not copied", !newCopies.some((c) => c.from.indexOf(".html") >= 0), "html copied");
  check("no authed public get", fake.authedPublic === 0, String(fake.authedPublic));
  const jobA = lib.mem.jobs.find((j) => j.id === "job_a");
  const jobB = lib.mem.jobs.find((j) => j.id === "job_b");
  const jobC = lib.mem.jobs.find((j) => j.id === "job_c");
  check("shared cards relinked to the same new url", jobA.photoUrl === jobB.photoUrl && jobA.photoUrl !== urls.shared && jobA.photoUrl.indexOf(slug) < 0, "urls differ");
  check("html card not relinked", jobC.photoUrl === urls.html, "html moved");
  check("html card has no move note", !(jobC.log || []).some((line) => String(line).indexOf("Upload moved") >= 0), "html noted");
  check("shared card has a say note and a log line", (jobA.thread || []).some((t) => t && t.kind === "note") && (jobA.log || []).indexOf("Upload moved to a private name") >= 0, "missing note");
  const card = lib.mem.jobs.find((j) => j.id === "job_mig");
  check("progress card has the steps", (card.thread || []).length >= 6 && (card.thread || []).some((t) => /flagged/.test(t.text || "")) && (card.log || []).indexOf("Note") >= 0, "thread " + (card.thread || []).length);
  const fileShared = lib.mem.files.find((f) => f.id === "file_old0");
  const fileHtml = lib.mem.files.find((f) => f.id === "file_old1");
  check("file record relinked", fileShared.url !== urls.shared && fileShared.remoteUrl === fileShared.url, "file url");
  check("html file record stays", fileHtml.url === urls.html && fileHtml.remoteUrl === urls.html, "html file");
  const packed = JSON.stringify({ jobs: lib.mem.jobs, files: lib.mem.files, inbox: lib.mem.inbox, audit: lib.mem.audit });
  const movedUrls = specs.filter((s) => s.key !== "html").map((s) => urls[s.key]);
  check("old urls gone except the flagged html", movedUrls.every((u) => packed.indexOf(u) < 0) && packed.indexOf(urls.html) >= 0, "leftover");
  const jobF = lib.mem.jobs.find((j) => j.id === "job_f");
  const inboxPdf = (lib.mem.inbox || []).find((row) => row && row.id === "in_pdf");
  check("pdf note and inbox moved", !!(jobF && jobF.notes.indexOf(urls.pdf) < 0 && inboxPdf && inboxPdf.text.indexOf(urls.pdf) < 0 && inboxPdf.text.indexOf("https://") === 0), "pdf refs");
  const was = lib.mem.migrations && lib.mem.migrations.uploads && lib.mem.migrations.uploads[urls.shared] && lib.mem.migrations.uploads[urls.shared].was;
  check("was list kept for rollback", Array.isArray(was) && was.filter((w) => w.jobId === "job_a" || w.jobId === "job_b").length >= 2, "was " + (was && was.length));
  check("flagged mapping not verified", lib.mem.migrations.uploads[urls.html] && lib.mem.migrations.uploads[urls.html].status === "flagged" && lib.mem.migrations.uploads[urls.html].verified === false, "flag");
  check("backup sealed", Object.keys(fake.files).some((k) => k.indexOf("aia/backup-uploads-") === 0 && String(fake.files[k]).indexOf("aia-blob-1") >= 0), "no backup");
  check("no charge", (lib.mem.money || []).length === moneyBefore && lib.mem.jobs.every((j) => j.charged !== true), "charged");
  const bodies = [stranger.body, helper.body, pending.body, bad.body, asString.body, bySession.body, byCookie.body, dry.body, earlyDelete.body, mismatch.body, applied.body];
  check("no token or pin in output", !bodies.some((b) => leaked(b, secrets)) && !leaked(lib.mem.jobs, secrets) && !leaked(lib.mem.audit, secrets) && !newCopies.some((c) => leaked(c, secrets) || String(c.pathname).indexOf(PIN) >= 0), "leak");

  const keysAfter = Object.keys(fake.files).sort().join("|");
  const urlsAfter = lib.mem.files.map((f) => f.url).join("|");
  const rerun = await call(mig, "POST", owner, { confirm: CONFIRM, apply: true, cardId: "job_mig" });
  check("rerun is a no-op", rerun.statusCode === 200 && rerun.body && rerun.body.noop === true && fake.dels.length === 0 && Object.keys(fake.files).sort().join("|") === keysAfter && lib.mem.files.map((f) => f.url).join("|") === urlsAfter, String(rerun.statusCode) + " " + (rerun.body && rerun.body.note));

  const delsBefore = fake.dels.length;
  const noYes = await call(mig, "POST", owner, { confirm: CONFIRM, action: "delete", cardId: "job_mig" });
  check("delete without confirm refused", noYes.statusCode === 403 && noYes.body && noYes.body.error === "Delete needs James's Yes.", String(noYes.statusCode) + " " + (noYes.body && noYes.body.error));
  check("refused delete leaves old blobs", fake.dels.length === delsBefore && fake.files[slug + "/file_" + stamp + "0.png"], "dels changed");
  const removed = await call(mig, "POST", owner, { confirm: CONFIRM, action: "delete", confirmDelete: "yes", cardId: "job_mig" });
  check("delete with yes", removed.statusCode === 200 && removed.body && removed.body.deleted === true && removed.body.removed === 8, String(removed.statusCode) + " removed " + (removed.body && removed.body.removed));
  check("old copies gone except html", !fake.files[slug + "/file_" + stamp + "0.png"] && fake.files[slug + "/file_" + stamp + "1.html"] && newCopies.every((c) => fake.files[c.pathname]), "delete set");
  check("backup kept", Object.keys(fake.files).some((k) => k.indexOf("aia/backup-uploads-") === 0), "backup gone");
  const delsAfter = fake.dels.length;
  const again = await call(mig, "POST", owner, { confirm: CONFIRM, action: "delete", confirmDelete: "yes", cardId: "job_mig" });
  check("second delete is a no-op", again.statusCode === 200 && again.body && again.body.noop === true && fake.dels.length === delsAfter, String(again.statusCode));
  check("no token or pin in delete output", !leaked(removed.body, secrets) && !leaked(noYes.body, secrets) && !leaked(again.body, secrets), "delete leak");
  process.stdout.write("RESULT " + JSON.stringify({ checks: checks }) + "\n");
}

async function childVerify(apiDir) {
  const Module = require("module");
  const mock = installMock(Module);
  mock.fake.corruptNew = true;
  const fake = mock.fake;
  const lib = require(path.join(apiDir, "_lib.js"));
  const auth = require(path.join(apiDir, "auth.js"));
  const mig = require(path.join(apiDir, "migrate-uploads.js"));
  await lib.ready();
  const checks = [];
  function check(name, ok, detail) { checks.push({ name: name, ok: !!ok, detail: ok ? "" : scrub(detail) }); }
  const slug = "springfield-shop";
  await call(auth, "POST", { "x-workspace": slug }, { action: "open", slug: slug, biz: "Springfield Shop", name: "James", pin: PIN });
  const stamp = "verifyme";
  for (let i = 0; i < 9; i++) {
    const ext = i === 1 ? "html" : "png";
    const bytes = i === 1 ? htmlBytes() : pngBytes(String(i));
    const type = i === 1 ? "text/html" : "image/png";
    const pathname = slug + "/file_" + stamp + i + "." + ext;
    const url = mock.publicUrl(pathname);
    fake.files[pathname] = Buffer.from(bytes);
    fake.types[pathname] = type;
    lib.mem.files.push({ id: "file_v" + i, workspace: slug, name: "v" + i + "." + ext, type: type, bytes: bytes.length, url: url, remoteUrl: url, driver: "blob" });
    lib.mem.jobs.push({ id: "job_v" + i, workspace: slug, title: "v" + i, photoUrl: url, files: [], log: [], thread: [], charged: false, status: "waiting" });
  }
  lib.mem.jobs.push({ id: "job_mig", workspace: slug, title: "Move", photoUrl: "", files: [], log: [], thread: [], charged: false, status: "waiting" });
  await lib.save();
  const beforeUrls = lib.mem.jobs.map((j) => j.id + ":" + (j.photoUrl || "")).join("|");
  const beforeThreads = lib.mem.jobs.map((j) => (j.thread || []).length).join(",");
  const res = await call(mig, "POST", { "x-workspace": slug, "x-pin": PIN }, { confirm: CONFIRM, apply: true, cardId: "job_mig" });
  const afterUrls = lib.mem.jobs.map((j) => j.id + ":" + (j.photoUrl || "")).join("|");
  check("verify failure aborts", res.statusCode === 409 && res.body && res.body.ok === false && /Verify failed/.test(res.body.error || ""), String(res.statusCode) + " " + (res.body && res.body.error));
  check("verify failure leaves cards unchanged", afterUrls === beforeUrls && lib.mem.jobs.map((j) => (j.thread || []).length).join(",") === beforeThreads, "cards moved");
  const uploads = lib.mem.migrations && lib.mem.migrations.uploads;
  check("verify failure saves no relink", !uploads || !Object.keys(uploads).length, "migrations " + (uploads && Object.keys(uploads).length));
  check("verify failure does not delete", fake.dels.length === 0, "dels " + fake.dels.length);
  process.stdout.write("RESULT " + JSON.stringify({ checks: checks }) + "\n");
}

async function childKeep(apiDir) {
  const Module = require("module");
  const mock = installMock(Module);
  const fake = mock.fake;
  const lib = require(path.join(apiDir, "_lib.js"));
  const auth = require(path.join(apiDir, "auth.js"));
  const mig = require(path.join(apiDir, "migrate-uploads.js"));
  await lib.ready();
  const checks = [];
  function check(name, ok, detail) { checks.push({ name: name, ok: !!ok, detail: ok ? "" : scrub(detail) }); }
  const slug = "springfield-shop";
  await call(auth, "POST", { "x-workspace": slug }, { action: "open", slug: slug, biz: "Springfield Shop", name: "James", pin: PIN });
  const stamp = "keeptype";
  for (let i = 0; i < 9; i++) {
    const ext = i === 1 ? "html" : (i === 5 ? "pdf" : "png");
    const bytes = i === 1 ? htmlBytes() : (i === 5 ? pdfBytes() : pngBytes(String(i)));
    const type = i === 1 ? "text/html" : (i === 5 ? "application/pdf" : "image/png");
    const pathname = slug + "/file_" + stamp + i + "." + ext;
    const url = mock.publicUrl(pathname);
    fake.files[pathname] = Buffer.from(bytes);
    fake.types[pathname] = type;
    lib.mem.files.push({ id: "file_k" + i, workspace: slug, name: "k" + i + "." + ext, type: type, bytes: bytes.length, url: url, remoteUrl: url, driver: "blob" });
  }
  lib.mem.jobs.push({ id: "job_mig", workspace: slug, title: "Move", log: [], thread: [], charged: false, status: "waiting", workspace: slug });
  await lib.save();
  const res = await call(mig, "POST", { "x-workspace": slug, "x-pin": PIN }, { confirm: CONFIRM, apply: true, keepOriginalTypes: true, cardId: "job_mig" });
  const pdf = fake.copies.find((c) => c.from.indexOf(".pdf") >= 0);
  const html = lib.mem.files.find((f) => f && f.id === "file_k1");
  check("keep original type on pdf", res.statusCode === 200 && pdf && pdf.contentType === "application/pdf", (pdf && pdf.contentType) + " status " + res.statusCode + " " + (res.body && res.body.error));
  check("keep original still flags html", html && html.url.indexOf(".html") >= 0 && !fake.copies.some((c) => c.from.indexOf(".html") >= 0), "html copied");
  process.stdout.write("RESULT " + JSON.stringify({ checks: checks }) + "\n");
}

async function childPreview(apiDir) {
  const Module = require("module");
  const mock = installMock(Module);
  const lib = require(path.join(apiDir, "_lib.js"));
  const auth = require(path.join(apiDir, "auth.js"));
  const mig = require(path.join(apiDir, "migrate-uploads.js"));
  await lib.ready();
  const checks = [];
  function check(name, ok, detail) { checks.push({ name: name, ok: !!ok, detail: ok ? "" : scrub(detail) }); }
  const slug = "springfield-shop";
  await call(auth, "POST", { "x-workspace": slug }, { action: "open", slug: slug, biz: "Springfield Shop", name: "James", pin: PIN });
  const before = mock.fake.sdkCalls;
  const res = await call(mig, "POST", { "x-workspace": slug, "x-pin": PIN }, { confirm: CONFIRM, apply: true });
  check("preview refused", res.statusCode === 409 && res.body && res.body.ok === false && /live desk/.test(res.body.error || ""), String(res.statusCode) + " " + (res.body && res.body.error));
  check("preview makes no blob calls", mock.fake.sdkCalls === before && mock.fake.copies.length === 0 && mock.fake.dels.length === 0, "sdk " + mock.fake.sdkCalls);
  let threw = "";
  try { await lib.blobCopy("https://example.invalid/a", "name", { contentType: "image/png" }); } catch (e) { threw = e && e.code || ""; }
  check("copy helper refuses off production", threw === "AIA_BLOB_PROD_ONLY", threw);
  try { await lib.blobHead("https://example.invalid/a"); } catch (e) { threw = e && e.code || ""; }
  check("head helper refuses off production", threw === "AIA_BLOB_PROD_ONLY", threw);
  try { await lib.blobDel("https://example.invalid/a"); } catch (e) { threw = e && e.code || ""; }
  check("del helper refuses off production", threw === "AIA_BLOB_PROD_ONLY", threw);
  check("off production still no blob calls", mock.fake.sdkCalls === before, "sdk " + mock.fake.sdkCalls);
  process.stdout.write("RESULT " + JSON.stringify({ checks: checks }) + "\n");
}

async function childHelpers(apiDir) {
  const Module = require("module");
  const mock = installMock(Module);
  const fake = mock.fake;
  const lib = require(path.join(apiDir, "_lib.js"));
  await lib.ready();
  const checks = [];
  function check(name, ok, detail) { checks.push({ name: name, ok: !!ok, detail: ok ? "" : scrub(detail) }); }
  const pathname = "springfield-shop/file_helper0.png";
  const bytes = pngBytes("h");
  fake.files[pathname] = Buffer.from(bytes);
  fake.types[pathname] = "image/png";
  const from = mock.publicUrl(pathname);
  fake.auths = [];
  const copied = await lib.blobCopy(from, "11111111-1111-4111-8111-111111111111-abcdef0123456789", { addRandomSuffix: true, contentType: "image/png" });
  check("copy uses storeId first", fake.auths[0] === "storeId" && copied && copied.url && fake.copies[0].addRandomSuffix === true, fake.auths.join(","));
  const headed = await lib.blobHead(copied.url);
  check("head sees the copy", headed && headed.size === bytes.length && headed.contentType === "image/png", JSON.stringify(headed && { size: headed.size, type: headed.contentType }));
  await lib.blobDel(copied.url);
  let missing = "";
  try { await lib.blobHead(copied.url); } catch (e) { missing = e && e.code || ""; }
  check("del then head is gone", missing === "AIA_BLOB_MISSING" && !fake.files[mock.pathFrom(copied.url)], missing);
  fake.failStoreId = true;
  fake.auths = [];
  const fell = await lib.blobCopy(from, "22222222-2222-4222-8222-222222222222-abcdef0123456789", { addRandomSuffix: true, contentType: "image/png" });
  check("storeId failure falls through", fake.auths[0] === "storeId" && fake.auths.indexOf("none") >= 0 && fell && fell.url, fake.auths.join(","));
  fake.failStoreId = false;
  fake.sdkDown = true;
  const rest = await lib.blobCopy(from, "33333333-3333-4333-8333-333333333333-abcdef0123456789", { addRandomSuffix: true, contentType: "image/png" });
  check("sdk failure uses REST copy", rest && rest.url && fake.copies.some((c) => c.auth === "rest" && c.addRandomSuffix), "rest " + fake.restWrites);
  fake.sdkDown = false;
  let blocked = "";
  try { await lib.blobPutAt("aia/store.json", "nope", {}); } catch (e) { blocked = e && e.message || ""; }
  check("backup put cannot overwrite the live store", /must not overwrite/.test(blocked), blocked);
  const backup = await lib.blobPutAt("aia/backup-uploads-test.json", "{\"aia\":\"aia-blob-1\"}", { addRandomSuffix: false, allowOverwrite: false, contentType: "application/json" });
  check("backup put is additive", backup && fake.files["aia/backup-uploads-test.json"] && fake.files["aia/store.json"], "backup missing");
  process.stdout.write("RESULT " + JSON.stringify({ checks: checks }) + "\n");
}

const MUTATIONS = [
  { id: "stranger gate", scenario: "flow", file: "migrate-uploads.js", from: 'if (!found.person) return deny(res, 401, "Desk code required.");', to: 'if (false && !found.person) return deny(res, 401, "Desk code required.");', check: "stranger refused" },
  { id: "owner gate", scenario: "flow", file: "migrate-uploads.js", from: 'if (!isOwner(found.person)) return deny(res, 403, "Only the owner can move old uploads.");', to: 'if (false && !isOwner(found.person)) return deny(res, 403, "Only the owner can move old uploads.");', check: "non-owner refused" },
  { id: "confirm gate", scenario: "flow", file: "migrate-uploads.js", from: 'if (!body || body.confirm !== CONFIRM) return deny(res, 403, "That confirm phrase does not match.");', to: 'if (false && (!body || body.confirm !== CONFIRM)) return deny(res, 403, "That confirm phrase does not match.");', check: "bad confirm refused" },
  { id: "dry-run default", scenario: "flow", file: "migrate-uploads.js", from: "return moveOld(req, res, ctx, body.apply === true);", to: "return moveOld(req, res, ctx, true);", check: "dry run changes nothing" },
  { id: "verify abort", scenario: "verify", file: "migrate-uploads.js", from: '      return send(res, 409, reportBody(ctx, Object.assign({ apply: true, ok: false }, base, {\n        items: plan.items.map(publicItem),\n        steps: steps,\n        error: "Verify failed. Nothing was relinked.",\n        verify: why\n      })));\n    }\n    copied[i].verified = true;', to: '      send(res, 409, reportBody(ctx, Object.assign({ apply: true, ok: false }, base, {\n        items: plan.items.map(publicItem),\n        steps: steps,\n        error: "Verify failed. Nothing was relinked.",\n        verify: why\n      })));\n    }\n    copied[i].verified = true;', check: "verify failure leaves cards unchanged" },
  { id: "delete confirm", scenario: "flow", file: "migrate-uploads.js", from: "if (!ctx.body || ctx.body.confirmDelete !== CONFIRM_DELETE) {", to: "if (false && (!ctx.body || ctx.body.confirmDelete !== CONFIRM_DELETE)) {", check: "delete without confirm refused" },
  { id: "delete verify", scenario: "flow", file: "migrate-uploads.js", from: "if (!ready.length || unfinished.length) {", to: "if (false && (!ready.length || unfinished.length)) {", check: "delete before verify refused" },
  { id: "html flag", scenario: "flow", file: "migrate-uploads.js", from: "if (isMarkup(item.bytesBuf, item.file, item.pathname)) {", to: "if (false && isMarkup(item.bytesBuf, item.file, item.pathname)) {", check: "html card not relinked" },
  { id: "apply does not delete", scenario: "flow", file: "migrate-uploads.js", from: "  await save();\n  steps.push({ step: \"report\", saved: true });", to: "  await save();\n  if (relinkItems[0]) await blobDel(relinkItems[0].url);\n  steps.push({ step: \"report\", saved: true });", check: "old blobs remain" },
  { id: "pin not in output", scenario: "flow", file: "migrate-uploads.js", from: 'note: "Dry run. Nothing was copied, relinked, or deleted."', to: 'note: "Dry run " + ((req.headers || {})["x-pin"] || "")', check: "no token or pin in output" },
  { id: "preview gate", scenario: "preview", file: "migrate-uploads.js", from: 'if (!blobAllowed()) return deny(res, 409, "Old uploads can only be moved on the live desk.");', to: 'if (false && !blobAllowed()) return deny(res, 409, "Old uploads can only be moved on the live desk.");', check: "preview refused" }
];

function mutate() {
  let caught = 0;
  MUTATIONS.forEach((m) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aia-mig-mut-"));
    const api = path.join(tmp, "api");
    fs.cpSync(path.join(root, "api"), api, { recursive: true });
    const file = path.join(api, m.file);
    const src = fs.readFileSync(file, "utf8");
    if (src.indexOf(m.from) < 0) {
      console.log("FAIL mutation " + m.id + " anchor missing");
      fs.rmSync(tmp, { recursive: true, force: true });
      return;
    }
    fs.writeFileSync(file, src.replace(m.from, m.to));
    const env = m.scenario === "preview" ? { VERCEL_ENV: "preview" } : null;
    const out = spawnChild(m.scenario, api, env);
    fs.rmSync(tmp, { recursive: true, force: true });
    const bad = (out.checks || []).filter((c) => !c.ok).map((c) => c.name);
    const hit = out.leak || out.error || bad.indexOf(m.check) >= 0;
    if (hit) {
      caught += 1;
      console.log("PASS mutation " + m.id + " caught (" + (out.leak ? "leak" : (out.error || bad[0] || m.check)) + ")");
    } else console.log("FAIL mutation " + m.id + " NOT caught");
  });
  console.log(caught + "/" + MUTATIONS.length + " mutations caught");
  if (caught !== MUTATIONS.length) process.exit(1);
}

if (process.argv[2] === "--child") {
  const scenario = process.argv[3];
  const apiDir = process.argv[4];
  const run = scenario === "verify" ? childVerify : scenario === "keep" ? childKeep : scenario === "preview" ? childPreview : scenario === "helpers" ? childHelpers : childFlow;
  run(apiDir).catch((e) => { console.error(scrub(e && e.stack || e)); process.exit(1); });
} else if (process.argv[2] === "--mutate") {
  mutate();
} else {
  assertSources();
  const previewEnv = { VERCEL_ENV: "preview" };
  judge(spawnChild("helpers"), "copy, head, and del against the mock store");
  judge(spawnChild("preview", null, previewEnv), "preview refuses and stays off the blob store");
  judge(spawnChild("flow"), "owner move of the nine files");
  judge(spawnChild("verify"), "verify failure aborts");
  judge(spawnChild("keep"), "keepOriginalTypes option");
  console.log("check-upload-migrate: ok");
}
