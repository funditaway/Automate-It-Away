#!/usr/bin/env node
// Cold lambda: the desk is already in the store, but hydrate has not applied
// it yet. Owner GET /api/upload and a public POST drop must wait for ready()
// or both answer 404 while /api/jobs on the same instance would find the desk.
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Module = require("module");

const root = path.join(__dirname, "..");
const slug = "cold-desk";
const pin = "4821";
const storeFile = path.join(os.tmpdir(), "aia-upload-cold-" + Date.now() + ".json");
const uploadDir = path.join(os.tmpdir(), "aia-upload-cold-files-" + Date.now());

function fail(msg) {
  console.error("FAIL " + msg);
  process.exit(1);
}
function pass(msg) { console.log("ok  " + msg); }

function hashPin(raw) {
  return crypto.createHash("sha256").update(String(raw) + ":" + (process.env.AIA_PIN_SALT || "aia-pilot")).digest("hex");
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

function call(handler, method, headers, body) {
  const res = mockRes();
  const pending = handler({ method: method, headers: headers || {}, body: body || {}, query: {} }, res);
  return pending.then(() => res);
}

function pngBytes() {
  return Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x00]);
}

async function main() {
  const pkg = fs.readFileSync(path.join(root, "package.json"), "utf8");
  if (pkg.indexOf("scripts/check-upload-cold.js") < 0) fail("package.json must run check-upload-cold");
  pass("package.json runs check-upload-cold");

  const hash = hashPin(pin);
  const store = {
    workspaces: [{
      slug: slug,
      name: "Owner",
      biz: "Cold Desk",
      pin: hash,
      people: [{ id: "p_owner", name: "Owner", role: "owner", pin: hash }]
    }],
    files: []
  };
  fs.mkdirSync(uploadDir, { recursive: true });
  fs.writeFileSync(storeFile, JSON.stringify(store));
  const onDisk = JSON.parse(fs.readFileSync(storeFile, "utf8"));
  if (!onDisk.workspaces || !onDisk.workspaces.some((w) => w && w.slug === slug)) {
    fail("store file must contain the real desk before the handler loads");
  }

  process.env.AIA_STORE_PATH = storeFile;
  process.env.AIA_UPLOAD_DIR = uploadDir;
  process.env.VERCEL_ENV = "production";
  process.env.BLOB_STORE_ID = "store_cold";
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN;
  delete process.env.AIA_BLOB_TOKEN;
  delete process.env.VERCEL_OIDC_TOKEN;

  // Hydrate awaits the blob head before it reads the store. Hold that head so
  // the required handler sees an unloaded desk, the same window as a cold lambda.
  let released = false;
  let releaseHold;
  const hold = new Promise((resolve) => { releaseHold = resolve; });
  function release() {
    if (released) return;
    released = true;
    releaseHold();
  }
  const origLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === "@vercel/blob") {
      return {
        async head() {
          if (!released) await hold;
          throw new Error("Vercel Blob: The requested blob does not exist");
        },
        async get() {
          throw new Error("Vercel Blob: The requested blob does not exist");
        },
        async put() {
          throw new Error("cold blob put is not this check");
        },
        async list() {
          return { blobs: [] };
        },
        async del() {}
      };
    }
    return origLoad.apply(this, arguments);
  };
  global.fetch = async () => ({
    ok: false,
    status: 404,
    statusText: "Not Found",
    text: async () => "",
    json: async () => ({}),
    headers: { get: () => "" }
  });

  delete global.__aia;
  delete global.__aiaHydrate;
  delete globalThis.__aia;
  delete globalThis.__aiaHydrate;
  ["../api/_lib", "../api/upload"].forEach((mod) => {
    try { delete require.cache[require.resolve(mod)]; } catch (e) {}
  });

  const upload = require(path.join(root, "api/upload"));
  const lib = require(path.join(root, "api/_lib"));
  const loaded = (lib.mem.workspaces || []).some((w) => w && w.slug === slug);
  if (loaded) fail("cold require loaded the desk before ready()");
  pass("required the real handler with the desk still unloaded");

  const hung = setTimeout(() => fail("cold upload check hung"), 15000);
  let getDone = false;
  let postDone = false;
  const listedP = call(upload, "GET", {
    "x-workspace": slug,
    "x-pin": pin,
    "x-forwarded-for": "203.0.113.10"
  }).then((res) => { getDone = true; return res; });
  const droppedP = call(upload, "POST", {
    "x-workspace": slug,
    "x-forwarded-for": "203.0.113.11"
  }, {
    name: "porch.png",
    type: "image/png",
    data: pngBytes().toString("base64")
  }).then((res) => { postDone = true; return res; });

  await new Promise((resolve) => setImmediate(resolve));
  if ((lib.mem.workspaces || []).some((w) => w && w.slug === slug)) {
    fail("desk loaded before the cold hold was released");
  }
  if (getDone || postDone) {
    release();
    const earlyGet = getDone ? await listedP : null;
    const earlyPost = postDone ? await droppedP : null;
    clearTimeout(hung);
    fail("handler returned before the store loaded"
      + (earlyGet ? " GET " + earlyGet.statusCode : "")
      + (earlyPost ? " POST " + earlyPost.statusCode : ""));
  }

  release();
  const listed = await listedP;
  const dropped = await droppedP;
  clearTimeout(hung);

  if (listed.statusCode !== 200 || !listed.body || listed.body.workspace !== slug || !Array.isArray(listed.body.files)) {
    fail("owner GET list on a cold store should be 200, got " + listed.statusCode + " " + JSON.stringify(listed.body));
  }
  pass("owner GET list on a cold store is 200");

  if (dropped.statusCode !== 201 || !dropped.body || !dropped.body.ok || !dropped.body.file || !dropped.body.file.id) {
    fail("public POST into the real desk on a cold store should be 201, got " + dropped.statusCode + " " + JSON.stringify(dropped.body));
  }
  const saved = (lib.mem.files || []).find((f) => f && f.id === dropped.body.file.id);
  if (!saved || saved.workspace !== slug) fail("public POST must land on the real desk");
  pass("public POST drop into the real desk on a cold store is 201");

  fs.rmSync(storeFile, { force: true });
  fs.rmSync(uploadDir, { recursive: true, force: true });
  console.log("check-upload-cold: ok");
}

main().catch((e) => fail(e && e.message ? e.message : e));
