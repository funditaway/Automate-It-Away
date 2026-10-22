#!/usr/bin/env node
require("./_env-guard");
// Proves /api/upload: strangers cannot list or fetch, public POST only lands
// in a real desk, seated owners can list and fetch, blob names are random,
// and stored types follow the byte sniff (png/jpeg/gif/webp, else octet-stream).
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");

function fail(msg) {
  console.error("FAIL " + msg);
  process.exit(1);
}
function pass(msg) { console.log("ok  " + msg); }

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function mockRes() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(k, v) { this.headers[k] = v; },
    getHeader(k) { return this.headers[k]; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    send(b) { this.body = b; return this; },
    end(b) { if (b !== undefined && this.body == null) this.body = b; return this; }
  };
}

async function call(handler, method, headers, body, query) {
  const res = mockRes();
  await handler({ method, headers: headers || {}, body: body || {}, query: query || {} }, res);
  return res;
}

function pngBytes() {
  return Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x00]);
}
function jpegBytes() {
  return Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01]);
}
function gifBytes() {
  return Buffer.concat([Buffer.from("GIF89a", "ascii"), Buffer.alloc(6)]);
}
function webpBytes() {
  const buf = Buffer.alloc(12);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(4, 4);
  buf.write("WEBP", 8, "ascii");
  return buf;
}
function pdfBytes() {
  return Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n");
}
function heicBytes() {
  return Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]),
    Buffer.from("heic", "ascii"),
    Buffer.alloc(12)
  ]);
}
function htmlBytes() {
  return Buffer.from("<!DOCTYPE html><html><body><script>alert(1)</script></body></html>");
}
function svgBytes() {
  return Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
}

function leaked(body, secret) {
  return JSON.stringify(body == null ? "" : body).indexOf(secret) >= 0;
}

function publicShape(file) {
  if (!file || typeof file !== "object") return false;
  const keys = Object.keys(file).sort();
  const photo = file.kind === "photo";
  const expect = photo
    ? ["bytes", "driver", "id", "kind", "name", "photoUrl", "type", "url"]
    : ["bytes", "driver", "id", "kind", "name", "type", "url"];
  return keys.join(",") === expect.join(",");
}

async function child() {
  const Module = require("module");
  const puts = [];
  const origLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === "@vercel/blob") {
      return {
        get: async () => null,
        head: async () => null,
        list: async () => ({ blobs: [] }),
        del: async () => {},
        put: async (name, body, opts) => {
          const o = opts || {};
          puts.push({
            name: String(name),
            contentType: o.contentType,
            addRandomSuffix: o.addRandomSuffix,
            allowOverwrite: o.allowOverwrite,
            bodyIsBuffer: Buffer.isBuffer(body)
          });
          return { url: "https://blob.example.test/" + String(name) + "-randsuffix" };
        }
      };
    }
    return origLoad.apply(this, arguments);
  };
  global.fetch = async () => ({
    ok: false, status: 404, statusText: "Not Found",
    text: async () => "", json: async () => ({}),
    headers: { get: () => "" }
  });

  const auth = require(path.join(root, "api/auth"));
  const upload = require(path.join(root, "api/upload"));
  const lib = require(path.join(root, "api/_lib"));
  await lib.ready();
  const slug = "springfield-shop";
  const opened = await call(auth, "POST", { "x-workspace": slug }, {
    action: "open", slug, biz: "Springfield Shop", name: "James", pin: "4821"
  });
  if (opened.statusCode !== 201) {
    process.stdout.write("RESULT " + JSON.stringify({ error: "open failed", status: opened.statusCode, body: opened.body }) + "\n");
    return;
  }
  function uploads() {
    return puts.filter((p) => p.name.indexOf("store.json") < 0);
  }
  async function post(item, ip) {
    const before = uploads().length;
    const res = await call(upload, "POST", { "x-workspace": slug, "x-forwarded-for": ip }, item);
    return { res, added: uploads().slice(before) };
  }
  const png = await post({
    name: "porch-secret.png",
    type: "image/png",
    data: pngBytes().toString("base64")
  }, "203.0.113.21");
  const pdf = await post({
    name: "quiet-ledger.pdf",
    type: "application/pdf",
    data: pdfBytes().toString("base64")
  }, "203.0.113.22");
  const html = await post({
    name: "page.html",
    type: "text/html",
    data: htmlBytes().toString("base64")
  }, "203.0.113.23");
  const named = [png, pdf].map((row) => row.added[0] || null);
  process.stdout.write("RESULT " + JSON.stringify({
    open: opened.statusCode,
    pngStatus: png.res.statusCode,
    pdfStatus: pdf.res.statusCode,
    htmlStatus: html.res.statusCode,
    pngPut: named[0],
    pdfPut: named[1],
    htmlPuts: html.added.length,
    pngUrl: png.res.body && png.res.body.photoUrl,
    pdfUrl: pdf.res.body && pdf.res.body.photoUrl,
    pngKind: png.res.body && png.res.body.file && png.res.body.file.kind,
    pdfKind: pdf.res.body && pdf.res.body.file && pdf.res.body.file.kind,
    pngFileUrl: png.res.body && png.res.body.file && png.res.body.file.photoUrl,
    pdfFileUrl: pdf.res.body && pdf.res.body.file && pdf.res.body.file.photoUrl,
    pngFiles: png.res.body && png.res.body.files,
    htmlBody: html.res.body
  }) + "\n");
}

function assertBlobChild() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aia-upload-privacy-"));
  const env = {
    PATH: process.env.PATH,
    HOME: tmp,
    AIA_STORE_PATH: path.join(tmp, "store.json"),
    AIA_UPLOAD_DIR: path.join(tmp, "up"),
    VERCEL_ENV: "production",
    BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_FAKESTORE_fakefakefake",
    BLOB_STORE_ID: "store_FAKESTORE",
    AIA_CHECK_PARENT: String(process.pid)
  };
  const r = spawnSync(process.execPath, [__filename, "--child"], { env, cwd: tmp, encoding: "utf8", timeout: 60000 });
  fs.rmSync(tmp, { recursive: true, force: true });
  const line = String(r.stdout || "").split("\n").find((l) => l.indexOf("RESULT ") === 0);
  if (!line) fail("blob child produced no result (exit " + r.status + "): " + String(r.stderr || "").slice(-500));
  const out = JSON.parse(line.slice(7));
  if (out.error) fail("blob child " + out.error + " " + JSON.stringify(out.body));
  if (out.pngStatus !== 201 || out.pdfStatus !== 201) fail("production POST into a real desk should save, got png " + out.pngStatus + " pdf " + out.pdfStatus);
  if (out.htmlStatus !== 415 || out.htmlPuts !== 0) fail("html must be refused before Blob put, got " + out.htmlStatus + " puts " + out.htmlPuts);
  ["pngPut", "pdfPut"].forEach((key) => {
    const put = out[key];
    if (!put) fail(key + " did not call Blob put");
    if (put.addRandomSuffix !== true) fail(key + " addRandomSuffix must be true");
    if (put.allowOverwrite !== false) fail(key + " allowOverwrite must be false");
    if (!put.bodyIsBuffer) fail(key + " Blob put must send a Buffer");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-[0-9a-f]{16}$/i.test(put.name)) {
      fail(key + " blob name is not random: " + put.name);
    }
    if (/springfield|porch|secret|ledger|quiet|\d{13}/i.test(put.name)) fail(key + " blob name is derived from desk, file, or time: " + put.name);
  });
  if (out.pngPut.contentType !== "image/png") fail("png Blob contentType must be image/png, got " + out.pngPut.contentType);
  if (out.pdfPut.contentType !== "application/octet-stream") fail("pdf Blob contentType must be application/octet-stream, got " + out.pdfPut.contentType);
  if (out.pngPut.name === out.pdfPut.name) fail("blob names must differ");
  if (out.pngKind !== "photo" || !out.pngUrl || out.pngUrl.indexOf(out.pngPut.name) < 0 || out.pngFileUrl !== out.pngUrl) {
    fail("a png must come back as photo with a photoUrl");
  }
  if (out.pdfKind !== "document" || out.pdfUrl || out.pdfFileUrl) fail("a pdf must come back as document with no photoUrl");
  if (/springfield|porch-secret|quiet-ledger/i.test(String(out.pngUrl || ""))) fail("Blob url must not contain the desk or filename");
  const pngFile = out.pngFiles && out.pngFiles[0];
  if (!pngFile || pngFile.remoteUrl || JSON.stringify(out.pngFiles).indexOf("remoteUrl") >= 0) fail("POST must not return remoteUrl");
  pass("Blob put uses a random name, addRandomSuffix, no overwrite, and the sniffed type");
}

function assertSources() {
  const uploadSrc = read("api/upload.js");
  const allowBlock = uploadSrc.slice(uploadSrc.indexOf("const ALLOW"), uploadSrc.indexOf("const MAX"));
  if (allowBlock.indexOf("text/html") >= 0 || allowBlock.indexOf("svg") >= 0) fail("ALLOW must not include html or svg");
  if (uploadSrc.indexOf("image/heic") < 0) fail("HEIC must stay accepted");
  if (uploadSrc.indexOf("addRandomSuffix: true") < 0 || uploadSrc.indexOf("allowOverwrite: false") < 0) {
    fail("Blob put must set addRandomSuffix true and allowOverwrite false");
  }
  if (uploadSrc.indexOf("addRandomSuffix: false") >= 0 || uploadSrc.indexOf("allowOverwrite: true") >= 0 || uploadSrc.indexOf("x-allow-overwrite") >= 0) {
    fail("upload must not allow overwrite or a fixed blob suffix");
  }
  if (uploadSrc.indexOf('"x-add-random-suffix": "1"') < 0) fail("REST Blob put must ask for a random suffix");
  if (uploadSrc.indexOf("X-Content-Type-Options") < 0 || uploadSrc.indexOf("nosniff") < 0) fail("fallback response must send nosniff");
  if (uploadSrc.indexOf("personOf") < 0) fail("GET must reuse personOf, the desk seat check");
  if (uploadSrc.indexOf('blobAllowed() && process.env.BLOB_READ_WRITE_TOKEN') < 0) fail("upload driver must stay behind blobAllowed()");
  if (/workspace \+ "\/"/.test(uploadSrc)) fail("stored name must not be derived from the desk");
  pass("upload source keeps the seat check, the type rules, and the blob guard");

  const drop = read("drop-app.js");
  const headersAt = drop.indexOf("function headers()");
  const headersFn = drop.slice(headersAt, drop.indexOf("function showMode"));
  if (headersFn.indexOf('h["X-Workspace"] = ws') < 0) fail("drop/widget headers must send the desk name");
  if (headersFn.indexOf('if (pin) h["X-Pin"] = pin') < 0) fail("drop/widget must send a pin only when one is already on the phone");
  if (headersFn.indexOf("X-Session") >= 0) fail("public drop headers must not require a session");
  const upAt = drop.indexOf('fetch("/api/upload"');
  const upFn = drop.slice(upAt, upAt + 240);
  if (upAt < 0 || upFn.indexOf("headers: headers()") < 0 || upFn.indexOf('method: "POST"') < 0) {
    fail("drop/widget must POST /api/upload with the desk headers");
  }
  ["drop.html", "widget.html"].forEach((file) => {
    const src = read(file);
    if (src.indexOf("/drop-app.js") < 0) fail(file + " must load drop-app.js");
  });
  const desks = read("desk-switch.js");
  if (desks.indexOf("ws=") < 0 || desks.indexOf("function captureDesk") < 0) fail("captureDesk must read ?ws=");
  pass("public /drop and /widget still upload with only the desk name");

  const desk = read("desk.html");
  if (desk.indexOf('h["X-Workspace"] = ws') < 0 || desk.indexOf('h["X-Session"] = tok') < 0 || desk.indexOf('h["X-Pin"] = pin') < 0) {
    fail("desk.html must keep sending X-Workspace, X-Session, and X-Pin");
  }
  if (desk.indexOf('api("/api/upload", { method: "POST"') < 0) fail("desk.html must still POST uploads through api()");
  pass("desk.html still sends the seat headers on upload");

  const apiDir = path.join(root, "api");
  const routes = fs.readdirSync(apiDir).filter((name) => name.endsWith(".js") && name[0] !== "_");
  if (routes.length > 12) fail("Vercel function count is " + routes.length + " (max 12)");
  pass("Vercel function count is " + routes.length);
}

async function main() {
  assertSources();
  const store = path.join(os.tmpdir(), "aia-upload-privacy-" + Date.now() + ".json");
  const uploadDir = path.join(os.tmpdir(), "aia-upload-privacy-files-" + Date.now());
  process.env.AIA_STORE_PATH = store;
  process.env.AIA_UPLOAD_DIR = uploadDir;
  delete process.env.VERCEL_ENV;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.BLOB_STORE_ID;
  delete global.__aia;
  delete global.__aiaHydrate;

  const auth = require(path.join(root, "api/auth"));
  const upload = require(path.join(root, "api/upload"));
  const desks = require(path.join(root, "api/_desks-http"));
  const lib = require(path.join(root, "api/_lib"));
  await lib.ready();

  const slug = "springfield-shop";
  const pin = "4821";
  const opened = await call(auth, "POST", { "x-workspace": slug }, {
    action: "open", slug, biz: "Springfield Shop", name: "James", pin
  });
  if (opened.statusCode !== 201) fail("could not open a desk for the privacy check");
  const token = opened.body && opened.body.session && opened.body.session.token;
  if (!token) fail("desk open should issue a session, same as the desk API");
  pass("opened a real desk");

  let ipn = 10;
  function ip() { ipn += 1; return "198.51.100." + ipn; }
  function stranger(extra) {
    return Object.assign({ "x-workspace": slug, "x-forwarded-for": ip() }, extra || {});
  }

  const beforeUnknown = (lib.mem.files || []).length;
  const unknown = await call(upload, "POST", { "x-workspace": "no-such-privacy-desk", "x-forwarded-for": ip() }, {
    name: "sneak.png", type: "image/png", data: pngBytes().toString("base64")
  });
  if (unknown.statusCode !== 404) fail("unknown desk POST should be 404, got " + unknown.statusCode);
  if ((lib.mem.files || []).length !== beforeUnknown) fail("unknown desk POST must not store a file");
  if (leaked(unknown.body, "sneak.png")) fail("unknown desk POST must not echo the file");
  const bare = await call(upload, "POST", { "x-forwarded-for": ip() }, {
    name: "sneak.png", type: "image/png", data: pngBytes().toString("base64")
  });
  if (bare.statusCode !== 404 || (lib.mem.files || []).length !== beforeUnknown) fail("POST with no desk name must 404 and store nothing");
  pass("POST into an unknown desk is 404 and stores nothing");

  const listed = await call(desks, "GET", { "x-workspace": slug });
  const list = await call(upload, "GET", stranger());
  if (listed.statusCode !== 401 || list.statusCode !== 401) fail("stranger list should be 401, same as GET /api/desks, got desks " + listed.statusCode + " upload " + list.statusCode);
  if (!list.body || list.body.files || list.body.count != null || leaked(list.body, "quiet-ledger")) {
    fail("stranger list must not include files, names, or counts: " + JSON.stringify(list.body));
  }
  pass("a stranger cannot list a desk's files");

  const pub = await call(upload, "POST", stranger(), {
    name: "quiet-ledger.pdf",
    type: "application/pdf",
    data: "data:application/pdf;base64," + pdfBytes().toString("base64")
  });
  if (pub.statusCode !== 201 || !pub.body || !pub.body.file || !pub.body.file.url) fail("public POST into a real desk should save with only the desk name");
  if (!Array.isArray(pub.body.files) || pub.body.files.length !== 1 || pub.body.files[0].id !== pub.body.file.id) {
    fail("POST reply must contain only the new file");
  }
  if (!publicShape(pub.body.file) || pub.body.file.remoteUrl) fail("POST file must be publicFile shaped, without remoteUrl");
  if (pub.body.file.type !== "application/octet-stream" || pub.body.file.kind !== "document" || pub.body.photoUrl || pub.body.file.photoUrl) {
    fail("a pdf must come back as document with no photoUrl");
  }
  const fileId = pub.body.file.id;
  if (!/^file_[0-9a-f]{32}$/.test(fileId)) fail("new file id is not random: " + fileId);
  const stored = (lib.mem.files || []).find((f) => f && f.id === fileId);
  if (!stored || stored.kind !== "document" || !stored.path || path.basename(stored.path) !== fileId) fail("local file name must be the random id, not the upload name");
  if (/quiet-ledger|springfield/.test(stored.path)) fail("stored path must not include the desk or filename");
  pass("public POST with only the desk name stores one new file");

  const again = await call(upload, "POST", stranger(), {
    name: "second-note.txt",
    type: "text/plain",
    data: Buffer.from("hello from the drop").toString("base64")
  });
  if (again.statusCode !== 201 || !again.body || !again.body.files || again.body.files.length !== 1) fail("second POST should reply with only that file");
  if (again.body.files.some((f) => f.id === fileId) || leaked(again.body, "quiet-ledger")) fail("POST reply must not list files already on the desk");
  pass("POST reply never includes the desk's other files");

  const wrongPin = await call(upload, "POST", { "x-workspace": slug, "x-pin": "0000", "x-forwarded-for": ip() }, {
    name: "drop.jpg",
    type: "image/jpeg",
    data: jpegBytes().toString("base64")
  });
  if (wrongPin.statusCode !== 201 || wrongPin.body.file.type !== "image/jpeg") fail("a public drop must stay open even when a stale pin is sent");
  if (wrongPin.body.file.kind !== "photo" || !wrongPin.body.photoUrl || wrongPin.body.file.photoUrl !== wrongPin.body.photoUrl) {
    fail("a jpeg must come back as photo with a photoUrl");
  }
  pass("public drop does not seat-check POST");

  const batch = await call(upload, "POST", stranger(), {
    files: [
      { name: "a.gif", type: "image/gif", data: gifBytes().toString("base64") },
      { name: "b.webp", type: "image/webp", data: webpBytes().toString("base64") }
    ]
  });
  if (batch.statusCode !== 201 || !batch.body.files || batch.body.files.length !== 2) fail("a multi-file drop should save just that batch");
  if (batch.body.files[0].type !== "image/gif" || batch.body.files[1].type !== "image/webp") fail("gif and webp must keep their real types");
  if (batch.body.files[0].kind !== "photo" || batch.body.files[1].kind !== "photo") fail("gif and webp must come back as photo");
  if (!batch.body.photoUrl || batch.body.files[0].photoUrl !== batch.body.photoUrl || !batch.body.files[1].photoUrl) {
    fail("gif and webp must come back with a photoUrl");
  }
  if (batch.body.files.some((f) => f.id === fileId)) fail("batch reply must not include older files");
  pass("gif and webp keep their real type; the batch reply is only the new files");

  const heic = await call(upload, "POST", stranger(), {
    name: "phone.heic",
    type: "image/heic",
    data: heicBytes().toString("base64")
  });
  if (heic.statusCode !== 201 || heic.body.file.type !== "application/octet-stream" || heic.body.file.kind !== "document" || heic.body.photoUrl || heic.body.file.photoUrl) {
    fail("HEIC must still save as a document with no photoUrl");
  }
  const heicStored = (lib.mem.files || []).find((f) => f && heic.body && heic.body.file && f.id === heic.body.file.id);
  if (!heicStored || heicStored.kind !== "document") fail("stored HEIC record must be kind document");
  pass("HEIC still uploads as a document, with no photoUrl");

  const docx = await call(upload, "POST", stranger(), {
    name: "estimate.docx",
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    data: Buffer.from("PK\x03\x04docx").toString("base64")
  });
  const mp4 = await call(upload, "POST", stranger(), {
    name: "clip.mp4",
    type: "video/mp4",
    data: Buffer.from("not-really-mp4").toString("base64")
  });
  if (docx.statusCode !== 201 || docx.body.file.type !== "application/octet-stream" || docx.body.file.kind !== "document" || docx.body.photoUrl) {
    fail("docx must stay accepted, as a document with no photoUrl");
  }
  if (mp4.statusCode !== 201 || mp4.body.file.type !== "application/octet-stream" || mp4.body.file.kind !== "document" || mp4.body.photoUrl) {
    fail("video must stay accepted, as a document with no photoUrl");
  }
  pass("office files and video still upload as octet-stream");

  const html = await call(upload, "POST", stranger(), {
    name: "page.html", type: "text/html", data: htmlBytes().toString("base64")
  });
  const svg = await call(upload, "POST", stranger(), {
    name: "icon.svg", type: "image/svg+xml", data: svgBytes().toString("base64")
  });
  const htmlNamedPng = await call(upload, "POST", stranger(), {
    name: "photo.png", type: "image/png", data: htmlBytes().toString("base64")
  });
  const pngNamedHtml = await call(upload, "POST", stranger(), {
    name: "photo.html", type: "image/png", data: pngBytes().toString("base64")
  });
  [html, svg, htmlNamedPng, pngNamedHtml].forEach((res) => {
    if (res.statusCode !== 415) fail("html and svg must be refused, got " + res.statusCode + " " + JSON.stringify(res.body));
  });
  if ((lib.mem.files || []).some((f) => f && /page\.html|icon\.svg|photo\.html/.test(f.name))) fail("refused html/svg must not be stored");
  pass("html and svg are refused, including a mislabeled file");

  const big = await call(upload, "POST", stranger(), {
    name: "big.txt",
    type: "text/plain",
    data: Buffer.alloc(8000001, 0x61).toString("base64")
  });
  if (big.statusCode !== 413 || !big.body || big.body.error !== "Each file must stay under 8MB.") {
    fail("size cap wording changed: " + big.statusCode + " " + JSON.stringify(big.body && big.body.error));
  }
  pass("the 8MB cap and its error wording stay");

  const peek = await call(upload, "GET", stranger());
  if (peek.statusCode !== 401 || (peek.body && peek.body.files) || leaked(peek.body, "quiet-ledger") || leaked(peek.body, fileId)) {
    fail("stranger still must not list after a public upload");
  }
  const fetchStranger = await call(upload, "GET", stranger(), {}, { id: fileId });
  if (fetchStranger.statusCode !== 401 || fetchStranger.headers.Location || leaked(fetchStranger.body, "quiet-ledger")) {
    fail("stranger fetch by id must be 401 with no file and no redirect");
  }
  if (Buffer.isBuffer(fetchStranger.body)) fail("stranger fetch must not return bytes");
  pass("a stranger cannot fetch a file by id");

  const ownerHeaders = { "x-workspace": slug, "x-pin": pin, "x-forwarded-for": ip() };
  const ownerList = await call(upload, "GET", ownerHeaders);
  const deskList = await call(desks, "GET", { "x-workspace": slug, "x-pin": pin });
  if (deskList.statusCode !== 200) fail("pin should open GET /api/desks");
  if (ownerList.statusCode !== 200 || !ownerList.body || !Array.isArray(ownerList.body.files)) fail("seated owner should list files");
  const seen = ownerList.body.files.find((f) => f.id === fileId);
  if (!seen || seen.name !== "quiet-ledger.pdf" || !publicShape(seen)) fail("owner list must return publicFile records");
  if (JSON.stringify(ownerList.body).indexOf("remoteUrl") >= 0) fail("owner list must not include remoteUrl");
  pass("a seated owner with the desk pin can list");

  const bySession = await call(upload, "GET", { "x-workspace": slug, "x-session": token, "x-forwarded-for": ip() });
  const byCookie = await call(upload, "GET", { "x-workspace": slug, cookie: "aia_session=" + encodeURIComponent(token), "x-forwarded-for": ip() });
  if (bySession.statusCode !== 200 || byCookie.statusCode !== 200) fail("X-Session and aia_session should open the file list, same as the desk API");
  pass("X-Session and the session cookie open the file list");

  const ownerFetch = await call(upload, "GET", ownerHeaders, {}, { id: fileId });
  if (ownerFetch.statusCode !== 200 || !Buffer.isBuffer(ownerFetch.body) || !ownerFetch.body.equals(pdfBytes())) {
    fail("seated owner should receive the stored bytes");
  }
  if (ownerFetch.headers["Content-Type"] !== "application/octet-stream") fail("pdf fallback type must be octet-stream");
  if (ownerFetch.headers["X-Content-Type-Options"] !== "nosniff") fail("fallback response must send nosniff");
  if (ownerFetch.headers["Content-Disposition"] !== "attachment") fail("non-image fallback must be an attachment");
  pass("seated fetch sends the bytes with nosniff");

  const png = await call(upload, "POST", stranger(), {
    name: "porch.png",
    type: "application/octet-stream",
    data: pngBytes().toString("base64")
  });
  if (png.statusCode !== 201 || png.body.file.type !== "image/png" || png.body.file.kind !== "photo" || !png.body.photoUrl || png.body.file.photoUrl !== png.body.photoUrl) {
    fail("a png must come back as photo with a photoUrl");
  }
  const pngFetch = await call(upload, "GET", ownerHeaders, {}, { id: png.body.file.id });
  if (pngFetch.statusCode !== 200 || pngFetch.headers["Content-Type"] !== "image/png" || pngFetch.headers["X-Content-Type-Options"] !== "nosniff") {
    fail("png fallback must be image/png with nosniff");
  }
  if (pngFetch.headers["Content-Disposition"]) fail("a real png should stay inline for the owner");
  pass("sniffed png is served as image/png with nosniff");

  const legacyUrl = "https://public.blob.vercel-storage.com/springfield-shop/file_oldtime.png";
  const legacyId = "file_oldtime";
  lib.mem.files.unshift({
    id: legacyId,
    workspace: slug,
    name: "already-there.png",
    type: "image/png",
    kind: "photo",
    bytes: 4,
    url: legacyUrl,
    remoteUrl: legacyUrl,
    driver: "blob",
    path: path.join(uploadDir, "do-not-move-me")
  });
  const legacyStranger = await call(upload, "GET", stranger(), {}, { id: legacyId });
  if (legacyStranger.statusCode !== 401 || legacyStranger.headers.Location || leaked(legacyStranger.body, legacyUrl)) {
    fail("stranger must not be redirected to an existing Blob url");
  }
  const legacyOwner = await call(upload, "GET", ownerHeaders, {}, { id: legacyId });
  if (legacyOwner.statusCode !== 302 || legacyOwner.headers.Location !== legacyUrl) fail("seated owner must still reach an existing Blob file at its current url");
  const still = (lib.mem.files || []).find((f) => f && f.id === legacyId);
  if (!still || still.remoteUrl !== legacyUrl || still.name !== "already-there.png") fail("existing stored files must not be moved, renamed, or deleted");
  pass("existing Blob files stay put and are readable by a seated owner");

  const other = await call(auth, "POST", { "x-workspace": "other-shop" }, {
    action: "open", slug: "other-shop", biz: "Other Shop", name: "Pat", pin: "1357"
  });
  if (other.statusCode !== 201) fail("second desk should open");
  const otherList = await call(upload, "GET", { "x-workspace": "other-shop", "x-pin": "1357", "x-forwarded-for": ip() });
  if (otherList.statusCode !== 200 || otherList.body.files.some((f) => f.id === fileId || f.name === "quiet-ledger.pdf")) {
    fail("another desk's owner must not see these files");
  }
  pass("a seat on one desk does not list another desk's files");

  const rateSlug = "rate-shop";
  const rateOpen = await call(auth, "POST", { "x-workspace": rateSlug }, {
    action: "open", slug: rateSlug, biz: "Rate Shop", name: "Rate", pin: "2468"
  });
  if (rateOpen.statusCode !== 201) fail("rate-limit desk should open");
  const rateMax = Number((read("api/upload.js").match(/const RATE_MAX = (\d+)/) || [])[1]);
  if (!rateMax) fail("RATE_MAX missing");
  const rateIp = "203.0.113.77";
  let saved = 0;
  let blocked = 0;
  for (let i = 0; i < rateMax + 3; i++) {
    const res = await call(upload, "POST", { "x-workspace": rateSlug, "x-forwarded-for": rateIp }, {
      name: "n.txt", type: "text/plain", data: Buffer.from("n" + i).toString("base64")
    });
    if (res.statusCode === 201) saved += 1;
    else if (res.statusCode === 429) {
      blocked += 1;
      if (res.body && res.body.files) fail("a rate-limited POST must not return a file list");
    } else fail("rate-limit POST returned " + res.statusCode);
  }
  const rateCount = (lib.mem.files || []).filter((f) => f && f.workspace === rateSlug).length;
  if (saved !== rateMax || blocked !== 3 || rateCount !== rateMax) {
    fail("per-sender rate limit should store " + rateMax + " and then refuse, saved " + saved + " blocked " + blocked + " stored " + rateCount);
  }
  pass("a sender is rate limited and extra POSTs store nothing");

  assertBlobChild();
  try { fs.rmSync(store, { force: true }); } catch (e) {}
  try { fs.rmSync(uploadDir, { recursive: true, force: true }); } catch (e) {}
  console.log("check-upload-privacy: ok");
}

if (process.argv[2] === "--child") {
  child().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
} else {
  main().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
}
