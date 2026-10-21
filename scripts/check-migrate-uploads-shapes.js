#!/usr/bin/env node
// Proves the read-only link-shape counts on POST /api/migrate-uploads (dry run and apply):
// every shape category counts right, nothing but numbers and listedVia comes back (no url,
// host, path, file id, file name, or desk name), the dry run copies, deletes, and saves
// nothing, and count / mismatch / missing / orphans / items still say what they said before.
// No network. The Blob store is a mock inside the child process.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const PIN = "4821";
const TOKEN = "vercel_blob_rw_FAKESTORE_fakefakefake";
const CONFIRM = "move-old-uploads";
const SLUG = "springfield-shop";
const UUID = "3f2b8c1e-4d5a-4b6c-9e7f-0a1b2c3d4e5f";
const HEX16 = "0123456789abcdef";

function fail(msg) {
  console.error("FAIL " + scrub(msg));
  process.exit(1);
}
function pass(msg) { console.log("ok  " + scrub(msg)); }
function scrub(msg) {
  return String(msg || "").split(PIN).join("[pin]").replace(/vercel_blob_rw_[A-Za-z0-9_]+/g, "[token]");
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

function assertSources() {
  const mig = read("api/migrate-uploads.js");
  const start = mig.indexOf("const UUID_HEAD");
  const end = mig.indexOf("function walkStore");
  if (start < 0 || end < start) fail("shape helpers missing from migrate-uploads.js");
  const shapeCode = mig.slice(start, end);
  const banned = ["blobCopy", "blobDel", "blobPutAt", "save(", "applyStore", "uploadMap(", "await ", "fetch(", "mem.files.push", "mem.migrations ="];
  banned.forEach((word) => {
    if (shapeCode.indexOf(word) >= 0) fail("shape helpers must stay read-only (found " + word.trim() + ")");
  });
  if (!/shapes: plan\.shapes/.test(mig)) fail("dry run and apply must both carry plan.shapes");
  if (mig.indexOf("blobListAll.via") < 0) fail("listedVia must come from the list helper");
  const lib = read("api/_lib.js");
  if (lib.indexOf('blobListAll.via = "sdk"') < 0 || lib.indexOf('blobListAll.via = "rest"') < 0) fail("list helper must record sdk or rest");
  const pkg = read("package.json");
  if (pkg.indexOf("scripts/check-migrate-uploads-shapes.js") < 0) fail("package.json must run check-migrate-uploads-shapes");
  if (pkg.indexOf("scripts/check-upload-migrate.js") < 0) fail("package.json must keep check-upload-migrate");
  pass("shape helpers are read-only and wired into the list helper and package.json");
}

function spawnChild(scenario) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aia-shape-"));
  const env = {
    PATH: process.env.PATH,
    HOME: tmp,
    AIA_STORE_PATH: path.join(tmp, "store.json"),
    AIA_UPLOAD_DIR: path.join(tmp, "up"),
    VERCEL_ENV: "production",
    BLOB_READ_WRITE_TOKEN: TOKEN,
    BLOB_STORE_ID: "store_FAKESTORE"
  };
  const r = spawnSync(process.execPath, [__filename, "--child", scenario], { env: env, cwd: tmp, encoding: "utf8", timeout: 60000 });
  fs.rmSync(tmp, { recursive: true, force: true });
  const blob = String(r.stdout || "") + "\n" + String(r.stderr || "");
  if (blob.indexOf(PIN) >= 0 || blob.indexOf(TOKEN) >= 0) return { leak: true, checks: [] };
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
  const fake = { files: Object.create(null), types: Object.create(null), listOnly: null, copies: [], dels: [], puts: [], sdkDown: false, restList: "ok", restListCalls: 0 };
  function pathFrom(u) {
    const s = String(u || "");
    if (!/^https?:/i.test(s)) return s.replace(/^\/+/, "");
    const parsed = new URL(s);
    const q = parsed.searchParams.get("pathname");
    if (q) return q;
    return decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  }
  function publicUrl(pathname) { return "https://store_FAKESTORE.public.blob.vercel-storage.com/" + pathname; }
  function noteAuth() { if (fake.sdkDown) throw new Error("Vercel Blob: No blob credentials found."); }
  function listing() {
    const keys = fake.listOnly || Object.keys(fake.files);
    return keys.map((p) => ({ pathname: p, url: publicUrl(p), size: 1, contentType: fake.types[p] || "application/octet-stream" }));
  }
  const orig = Module._load;
  Module._load = function (request) {
    if (request === "@vercel/blob") {
      return {
        async get(key, opts) {
          noteAuth(opts);
          const raw = fake.files[pathFrom(key)];
          if (!raw) throw new Error("Vercel Blob: The requested blob does not exist");
          const text = Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw);
          return { statusCode: 200, stream: { text: async () => text }, blob: { url: publicUrl(pathFrom(key)) } };
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
          const pathname = String(key);
          fake.files[pathname] = Buffer.isBuffer(body) ? Buffer.from(body) : Buffer.from(String(body));
          fake.types[pathname] = (opts && opts.contentType) || "application/octet-stream";
          fake.puts.push(pathname);
          return { url: publicUrl(pathname), pathname: pathname, size: fake.files[pathname].length };
        },
        async del(key, opts) { noteAuth(opts); fake.dels.push(pathFrom(key)); delete fake.files[pathFrom(key)]; },
        async list(opts) { noteAuth(opts); return { blobs: listing(), hasMore: false }; },
        async copy(fromUrl, toPathname, opts) { noteAuth(opts); fake.copies.push(String(toPathname)); throw new Error("copy must not run"); }
      };
    }
    return orig.apply(this, arguments);
  };
  global.fetch = async function (url, opts) {
    const u = String(url || "");
    const method = String((opts && opts.method) || "GET").toUpperCase();
    const none = { ok: false, status: 404, headers: { get: () => null }, text: async () => "", arrayBuffer: async () => Buffer.alloc(0) };
    if (u.indexOf("vercel.com/api/blob?") >= 0 && method === "GET") {
      fake.restListCalls += 1;
      if (fake.restList !== "ok") return { ok: false, status: 500, headers: { get: () => null }, text: async () => "{\"error\":{\"message\":\"list down\"}}" };
      return { ok: true, status: 200, headers: { get: () => "application/json" }, text: async () => JSON.stringify({ blobs: listing(), hasMore: false }) };
    }
    if (u.indexOf("blob.vercel-storage.com") >= 0 && method === "GET") {
      const raw = fake.files[pathFrom(u)];
      if (!raw) return none;
      const buf = Buffer.isBuffer(raw) ? Buffer.from(raw) : Buffer.from(String(raw));
      return {
        ok: true, status: 200,
        headers: { get: (k) => (String(k).toLowerCase() === "content-type" ? (fake.types[pathFrom(u)] || "application/octet-stream") : (String(k).toLowerCase() === "content-length" ? String(buf.length) : null)) },
        text: async () => buf.toString("utf8"), arrayBuffer: async () => buf
      };
    }
    if (method === "PUT" || method === "POST") fake.puts.push("rest-write");
    return none;
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
function pngBytes(n) { return Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), Buffer.from("png" + n)]); }
function pdfBytes() { return Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n"); }

// Every leaf in shapes is a number, except listedVia. Nothing else can carry text.
function onlyNumbers(node, trail) {
  if (typeof node === "number") return true;
  if (typeof node === "string") return trail === "listedVia" || trail === "error";
  if (!node || typeof node !== "object") return false;
  return Object.keys(node).every((k) => onlyNumbers(node[k], k));
}
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

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
  return { mock: mock, fake: mock.fake, lib: lib, mig: mig, checks: checks, check: check, owner: { "x-workspace": SLUG, "x-pin": PIN } };
}

function leakCheck(t, label, shapes, extra) {
  const text = JSON.stringify(shapes);
  const strings = [
    SLUG, "other-desk-name", "store_FAKESTORE", "blob.vercel-storage", "cdn.elsewhere-example", "elsewhere", "photo-secret",
    "file_idsecret", "idsecret", UUID, HEX16, "Ab3dEf9hJk", "abc123", "def456", "ghi789", "jkl000", "clip", "notes.docx", "receipt",
    "k3j9x2m8q1w7", "Photo", "README", "store-fixture", "uploads", "https:", "http:", "/api/upload", PIN, TOKEN, "vercel_blob"
  ].concat(extra || []);
  const hit = strings.filter((s) => text.indexOf(s) >= 0);
  t.check(label + ": no url, host, id, filename, or desk name in shapes", hit.length === 0, "found " + hit.length + " fixture strings");
  t.check(label + ": shapes holds only numbers and listedVia", onlyNumbers(shapes, ""), "non-number leaf");
}

async function childShapes() {
  const t = await setup();
  const { fake, lib, mig, mock } = t;
  const V = (p) => mock.publicUrl(p);
  const oldA = SLUG + "/file_abc123.png";
  const oldB = SLUG + "/file_jkl000.pdf";
  const newName = UUID + "-" + HEX16 + "-Ab3dEf9hJk.pdf";
  const files = [
    { id: "file_idsecret1", workspace: SLUG, name: "q1-report.png", url: V(oldA), remoteUrl: V(oldA), driver: "blob" },
    { id: "file_idsecret2", workspace: SLUG, name: "two.png", url: V(SLUG + "/file_zz9.PNG"), driver: "blob" },
    { id: "file_idsecret3", workspace: SLUG, name: "three.pdf", url: V(newName), driver: "blob" },
    { id: "file_idsecret4", name: "four.jpg", url: "https://cdn.elsewhere-example.org/uploads/2026/photo-secret.jpg", driver: "local" },
    { id: "file_idsecret5", workspace: SLUG, name: "five", url: "/api/upload?id=file_idsecret1", driver: "tmp-file" },
    { id: "file_idsecret6", workspace: SLUG, name: "six.jpg", url: SLUG + "/file_def456.jpg", driver: "blob" },
    { id: "file_idsecret7", workspace: "other-desk-name", name: "seven.webp", url: "", remoteUrl: V(SLUG + "/file_ghi789.webp") },
    { id: "file_idsecret8", name: "eight.html", url: "/uploads/file_x1.html", driver: "tmp-file" },
    { id: "file_idsecret9", workspace: SLUG, name: "nine.mp4", url: "http://store_FAKESTORE.public.blob.vercel-storage.com/a/b/c/clip.mp4", driver: "blob" },
    { id: "file_idsecret10" },
    "not-a-record-string",
    { id: "file_idsecret12", workspace: SLUG, name: "twelve.png", url: V(SLUG + "/receipt-k3j9x2m8q1w7.png"), driver: "blob" },
    { id: "file_idsecret13", workspace: SLUG, name: "notes.docx", url: V(SLUG + "/notes.docx"), driver: "blob" }
  ];
  lib.mem.files.length = 0;
  files.forEach((f) => lib.mem.files.push(f));
  lib.mem.migrations = { uploads: {} };
  lib.mem.migrations.uploads[V(oldA)] = { oldUrl: V(oldA), oldPath: oldA, status: "flagged", verified: false, reason: "markup", oldDeleted: false, was: [] };
  lib.mem.migrations.uploads["row-two"] = { oldPath: SLUG + "/file_def456.jpg", status: "flagged", verified: false, reason: "markup", oldDeleted: false, was: [] };
  const blobNames = [oldA, oldB, newName, "aia/store-fixture.json", SLUG + "/Photo.JPG", SLUG + "/README"];
  blobNames.forEach((p) => { fake.files[p] = p === oldB ? pdfBytes() : pngBytes(p.length); fake.types[p] = p === oldB ? "application/pdf" : "image/png"; });
  fake.listOnly = blobNames.slice();
  await lib.save();

  function snap() {
    return JSON.stringify({ files: lib.mem.files, jobs: lib.mem.jobs, migrations: lib.mem.migrations, money: lib.mem.money || [], keys: Object.keys(fake.files).sort() });
  }
  const before = snap();
  const putsBefore = fake.puts.length;
  const dry = await call(mig, "POST", t.owner, { confirm: CONFIRM });
  const body = dry.body || {};
  const s = body.shapes || {};
  t.check("dry run answers 200 with shapes", dry.statusCode === 200 && body.dryRun === true && !!body.shapes, String(dry.statusCode));
  t.check("listedVia is sdk", s.listedVia === "sdk", String(s.listedVia));
  t.check("totals", s.filesTotal === 13 && s.blobsTotal === 6 && s.files.total === 13 && s.blobs.total === 6, JSON.stringify([s.filesTotal, s.blobsTotal]));
  t.check("old-path totals", s.filesMatchingOldPath === 2 && s.blobsMatchingOldPath === 2 && s.files.matchesOldPath === 2 && s.blobs.matchesOldPath === 2, JSON.stringify([s.filesMatchingOldPath, s.blobsMatchingOldPath]));
  const f = s.files;
  const b = s.blobs;
  t.check("files: non-record entry counted once", f.notText === 1, String(f.notText));
  t.check("files: absolute vs relative url", same(f.url, { absolute: 8, protocolRelative: 0, relative: 3, none: 1 }), JSON.stringify(f.url));
  t.check("files: relative api route and query", f.relativeApiRoute === 1 && f.hasQuery === 1, JSON.stringify([f.relativeApiRoute, f.hasQuery]));
  t.check("files: host class", same(f.host, { vercelBlob: 7, other: 1, none: 4 }), JSON.stringify(f.host));
  t.check("files: folder depth", same(f.depth, { "0": 2, "1": 8, "2": 1, "3plus": 1 }), JSON.stringify(f.depth));
  t.check("files: file_ prefix, uuid, uuid-hex16, random suffix", f.filePrefix === 5 && f.uuidName === 1 && f.uuidHex16Name === 1 && f.randomSuffix === 2, JSON.stringify([f.filePrefix, f.uuidName, f.uuidHex16Name, f.randomSuffix]));
  t.check("files: extension class", same(f.ext, { image: 6, pdf: 1, video: 1, htmlSvg: 1, other: 1, none: 2 }), JSON.stringify(f.ext));
  t.check("files: uppercase extension", f.upperExt === 1, String(f.upperExt));
  t.check("files: driver", same(f.driver, { blob: 7, tmpFile: 2, other: 1, none: 2 }), JSON.stringify(f.driver));
  t.check("files: old path match, look-alike, mapping", f.matchesOldPath === 2 && f.looksOldPath === 4 && f.hasMapping === 2, JSON.stringify([f.matchesOldPath, f.looksOldPath, f.hasMapping]));
  t.check("files: desk present, known, first segment", f.slugPresent === 9 && f.slugKnown === 6 && f.slugIsFirstSegment === 5, JSON.stringify([f.slugPresent, f.slugKnown, f.slugIsFirstSegment]));
  t.check("files: remoteUrl counts", same(f.remoteUrl, { present: 2, sameAsUrl: 1, matchesOldPath: 2 }), JSON.stringify(f.remoteUrl));
  t.check("blobs: absolute url, vercel host, no query", same(b.url, { absolute: 6, protocolRelative: 0, relative: 0, none: 0 }) && same(b.host, { vercelBlob: 6, other: 0, none: 0 }) && b.hasQuery === 0 && b.relativeApiRoute === 0, JSON.stringify([b.url, b.host]));
  t.check("blobs: folder depth", same(b.depth, { "0": 1, "1": 5, "2": 0, "3plus": 0 }), JSON.stringify(b.depth));
  t.check("blobs: file_ prefix, uuid, uuid-hex16, random suffix", b.filePrefix === 2 && b.uuidName === 1 && b.uuidHex16Name === 1 && b.randomSuffix === 1, JSON.stringify([b.filePrefix, b.uuidName, b.uuidHex16Name, b.randomSuffix]));
  t.check("blobs: extension class and uppercase", same(b.ext, { image: 2, pdf: 2, video: 0, htmlSvg: 0, other: 1, none: 1 }) && b.upperExt === 1, JSON.stringify([b.ext, b.upperExt]));
  t.check("blobs: old path, mapping, known desk segment", b.looksOldPath === 2 && b.hasMapping === 1 && b.slugKnown === 4, JSON.stringify([b.looksOldPath, b.hasMapping, b.slugKnown]));
  t.check("blobs: no driver or desk-field keys", b.driver === undefined && b.slugPresent === undefined && b.remoteUrl === undefined, "extra keys");
  leakCheck(t, "dry run", s, []);
  const whole = JSON.stringify(s);
  t.check("shapes does not echo any file record", !lib.mem.files.some((r) => r && r.id && whole.indexOf(r.id) >= 0), "id echoed");

  t.check("plan semantics: count, mismatch, missing, orphans", body.count === 2 && body.mismatch === true && body.missing.length === 1 && body.orphans.length === 1 && body.expect === 9, JSON.stringify([body.count, body.mismatch, body.missing.length, body.orphans.length]));
  t.check("plan semantics: items", body.items.length === 2 && body.items.map((i) => i.plan).sort().join(",") === "copy,flagged", JSON.stringify(body.items.map((i) => i.plan)));
  t.check("steps unchanged", body.steps.length === 2 && body.steps[0].step === "preflight" && body.steps[1].step === "inventory" && body.steps[1].count === 2, JSON.stringify(body.steps.map((x) => x.step)));
  t.check("dry run copies, deletes, and saves nothing", snap() === before && fake.copies.length === 0 && fake.dels.length === 0 && fake.puts.length === putsBefore, JSON.stringify([fake.copies.length, fake.dels.length, fake.puts.length - putsBefore]));

  const applied = await call(mig, "POST", t.owner, { confirm: CONFIRM, apply: true });
  t.check("apply with a mismatch still refuses with 409", applied.statusCode === 409 && applied.body && applied.body.mismatch === true && applied.body.apply === true, String(applied.statusCode));
  t.check("apply response carries the same shapes", applied.body && same(applied.body.shapes, s), "shapes differ");
  t.check("refused apply copies, deletes, and saves nothing", snap() === before && fake.copies.length === 0 && fake.dels.length === 0 && fake.puts.length === putsBefore, JSON.stringify([fake.copies.length, fake.dels.length]));
  return t.checks;
}

async function childNine() {
  const t = await setup();
  const { fake, lib, mig, mock } = t;
  lib.mem.files.length = 0;
  lib.mem.migrations = { uploads: {} };
  const names = [];
  for (let i = 0; i < 9; i++) {
    const p = SLUG + "/file_zq" + i + ".png";
    names.push(p);
    fake.files[p] = pngBytes(i);
    fake.types[p] = "image/png";
    lib.mem.files.push({ id: "file_idsecret" + i, workspace: SLUG, name: "n" + i + ".png", type: "image/png", url: mock.publicUrl(p), remoteUrl: mock.publicUrl(p), driver: "blob" });
  }
  fake.listOnly = names.slice();
  await lib.save();
  const putsBefore = fake.puts.length;
  const dry = await call(mig, "POST", t.owner, { confirm: CONFIRM });
  const body = dry.body || {};
  t.check("nine matching records: count 9, no mismatch", dry.statusCode === 200 && body.count === 9 && body.mismatch === false && body.missing.length === 0 && body.orphans.length === 0, JSON.stringify([dry.statusCode, body.count, body.mismatch]));
  t.check("nine matching records: shape totals agree", body.shapes && body.shapes.filesTotal === 9 && body.shapes.blobsTotal === 9 && body.shapes.filesMatchingOldPath === 9 && body.shapes.blobsMatchingOldPath === 9, JSON.stringify(body.shapes && [body.shapes.filesTotal, body.shapes.blobsTotal]));
  t.check("nine matching records: items all plan copy", body.items.length === 9 && body.items.every((i) => i.plan === "copy"), JSON.stringify(body.items.map((i) => i.plan)));
  leakCheck(t, "nine", body.shapes, ["zq"]);
  t.check("nine dry run copies, deletes, and saves nothing", fake.copies.length === 0 && fake.dels.length === 0 && fake.puts.length === putsBefore, "writes");
  // a tenth old blob: mismatch, and apply refuses
  const extra = SLUG + "/file_zq9.png";
  fake.files[extra] = pngBytes(9);
  fake.types[extra] = "image/png";
  fake.listOnly.push(extra);
  const ten = await call(mig, "POST", t.owner, { confirm: CONFIRM });
  t.check("ten old blobs: mismatch true, count 10", ten.body && ten.body.mismatch === true && ten.body.count === 10 && ten.body.orphans.length === 1, JSON.stringify(ten.body && [ten.body.mismatch, ten.body.count]));
  t.check("ten old blobs: blobs counted, files unchanged", ten.body.shapes.blobsTotal === 10 && ten.body.shapes.filesTotal === 9, JSON.stringify(ten.body.shapes && [ten.body.shapes.blobsTotal, ten.body.shapes.filesTotal]));
  const tenApply = await call(mig, "POST", t.owner, { confirm: CONFIRM, apply: true });
  t.check("ten old blobs: apply refused, nothing written", tenApply.statusCode === 409 && fake.copies.length === 0 && fake.dels.length === 0 && fake.puts.length === putsBefore, String(tenApply.statusCode));
  return t.checks;
}

async function childListing() {
  const t = await setup();
  const { fake, lib, mig, mock } = t;
  lib.mem.files.length = 0;
  lib.mem.migrations = { uploads: {} };
  const p = SLUG + "/file_zr0.png";
  fake.files[p] = pngBytes(0);
  fake.types[p] = "image/png";
  fake.listOnly = [p];
  lib.mem.files.push({ id: "file_idsecret0", workspace: SLUG, url: mock.publicUrl(p), driver: "blob" });
  await lib.save();
  const putsBefore = fake.puts.length;
  fake.sdkDown = true;
  const viaRest = await call(mig, "POST", t.owner, { confirm: CONFIRM });
  const rs = viaRest.body && viaRest.body.shapes;
  t.check("sdk down: listing falls back to rest and says so", viaRest.statusCode === 200 && rs && rs.listedVia === "rest" && rs.blobsTotal === 1 && fake.restListCalls === 1, JSON.stringify([viaRest.statusCode, rs && rs.listedVia]));
  t.check("rest fallback: plan still counts the old blob", viaRest.body && viaRest.body.count === 1 && viaRest.body.mismatch === true, JSON.stringify(viaRest.body && viaRest.body.count));
  leakCheck(t, "rest", rs, ["zr0"]);
  fake.restList = "down";
  const down = await call(mig, "POST", t.owner, { confirm: CONFIRM });
  const ds = down.body && down.body.shapes;
  t.check("listing failed: still 500 with the same error step", down.statusCode === 500 && down.body && down.body.ok === false && down.body.step === "inventory", String(down.statusCode));
  t.check("listing failed: shapes say failed and still count the files", ds && ds.listedVia === "failed" && ds.filesTotal === 1 && ds.blobsTotal === 0, JSON.stringify(ds && [ds.listedVia, ds.filesTotal, ds.blobsTotal]));
  leakCheck(t, "failed", ds, ["zr0"]);
  t.check("listing paths write nothing", fake.copies.length === 0 && fake.dels.length === 0 && fake.puts.length === putsBefore, "writes");
  return t.checks;
}

if (process.argv[2] === "--child") {
  const run = { shapes: childShapes, nine: childNine, listing: childListing }[process.argv[3]];
  run().then((checks) => { console.log("RESULT " + JSON.stringify({ checks: checks })); }).catch((e) => { console.error(scrub(e && e.stack || e)); process.exit(1); });
} else {
  assertSources();
  judge(spawnChild("shapes"), "every shape category counts right and nothing leaks");
  judge(spawnChild("nine"), "nine old uploads: plan and mismatch unchanged");
  judge(spawnChild("listing"), "listedVia rest and failed");
  console.log("check-migrate-uploads-shapes: ok");
}
