const fs = require("fs");
const os = require("os");
const path = require("path");
const Module = require("module");

const BLOB_KEY = "aia/store.json";
const fake = {
  access: "private",
  files: Object.create(null),
  gets: [],
  puts: [],
  heads: [],
  tokens: [],
  rests: [],
  putBodies: [],
  restPutErr: null,
  sdkFail: false,
  sdkCreds: false,
  forcePublic: false
};

function restPath(u) {
  try {
    const parsed = new URL(String(u || ""), "https://example.invalid");
    const q = parsed.searchParams.get("pathname");
    if (q) return q;
    const m = String(u || "").match(/blob\.vercel-storage\.com\/(.+)$/);
    if (m) return decodeURIComponent(m[1]);
  } catch (e) {}
  return BLOB_KEY;
}

function noteAuth(opts) {
  fake.tokens.push(opts && Object.prototype.hasOwnProperty.call(opts, "token") ? opts.token : undefined);
}

function sdkDenied() {
  if (fake.sdkFail) throw new Error("Vercel Blob: Failed to fetch blob: 403 Forbidden");
  if (fake.sdkCreds) {
    throw new Error("Vercel Blob: No blob credentials found. Pass a `token` option, set `BLOB_READ_WRITE_TOKEN`, or use `oidcToken` (or `VERCEL_OIDC_TOKEN`) with `storeId` or `BLOB_STORE_ID`.");
  }
  return false;
}

const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "@vercel/blob") {
    return {
      async get(key, opts) {
        const access = opts && opts.access;
        fake.gets.push(access);
        noteAuth(opts);
        sdkDenied();
        const url = String(key || "");
        if (!/^https?:/i.test(url)) {
          throw new Error("Vercel Blob: Failed to fetch blob: 403 Forbidden");
        }
        const pathname = BLOB_KEY;
        if (!fake.files[pathname]) return null;
        const raw = fake.files[pathname];
        return {
          statusCode: 200,
          stream: { text: async () => raw },
          blob: { url: "https://testhost." + fake.access + ".blob.vercel-storage.com/" + pathname }
        };
      },
      async head(key, opts) {
        fake.heads.push(key);
        noteAuth(opts);
        sdkDenied();
        if (!fake.files[BLOB_KEY]) {
          throw new Error("Vercel Blob: The requested blob does not exist");
        }
        return {
          pathname: BLOB_KEY,
          url: "https://testhost." + fake.access + ".blob.vercel-storage.com/" + BLOB_KEY,
          downloadUrl: "https://testhost." + fake.access + ".blob.vercel-storage.com/" + BLOB_KEY + "?download=1"
        };
      },
      async put(key, body, opts) {
        const access = opts && opts.access;
        fake.puts.push(access);
        noteAuth(opts);
        sdkDenied();
        if (access === "private" && fake.forcePublic) {
          throw new Error("Vercel Blob: access must be \"public\" for this store");
        }
        fake.access = access || fake.access;
        fake.files[key] = typeof body === "string" ? body : String(body);
        return {
          url: "https://testhost." + (access || fake.access) + ".blob.vercel-storage.com/" + key,
          downloadUrl: "https://testhost." + (access || fake.access) + ".blob.vercel-storage.com/" + key + "?download=1"
        };
      },
      async del(key) {
        delete fake.files[key];
      },
      async list(opts) {
        noteAuth(opts);
        sdkDenied();
        const prefix = (opts && opts.prefix) || "";
        const blobs = Object.keys(fake.files).filter((p) => p.indexOf(prefix) === 0).map((p) => ({
          pathname: p,
          url: "https://testhost." + fake.access + ".blob.vercel-storage.com/" + p,
          downloadUrl: "https://testhost." + fake.access + ".blob.vercel-storage.com/" + p + "?download=1"
        }));
        return { blobs, hasMore: false };
      }
    };
  }
  return origLoad.apply(this, arguments);
};

const origFetch = global.fetch;
global.fetch = async function (url, opts) {
  const u = String(url || "");
  if (u.indexOf("blob.vercel-storage.com/") < 0 && u.indexOf("vercel.com/api/blob") < 0) {
    if (typeof origFetch === "function") return origFetch.apply(this, arguments);
    throw new Error("unexpected fetch " + u);
  }
  fake.rests.push((opts && opts.method) || "GET");
  const method = String((opts && opts.method) || "GET").toUpperCase();
  const pathname = restPath(u);
  if (method === "PUT") {
    if (fake.restPutErr) {
      return {
        ok: false,
        status: fake.restPutStatus || 400,
        url: u,
        text: async () => JSON.stringify(fake.restPutErr)
      };
    }
    const body = opts && opts.body;
    fake.putBodies.push({
      pathname,
      isBuffer: Buffer.isBuffer(body),
      headers: Object.assign({}, (opts && opts.headers) || {})
    });
    fake.files[pathname] = Buffer.isBuffer(body) ? body.toString("utf8") : String(body || "");
    fake.access = "public";
    return {
      ok: true,
      status: 200,
      url: "https://blob.vercel-storage.com/" + pathname,
      text: async () => JSON.stringify({ url: "https://testhost.public.blob.vercel-storage.com/" + pathname })
    };
  }
  if (!fake.files[pathname]) {
    return { ok: false, status: 404, statusText: "Not Found", url: u, text: async () => "" };
  }
  return {
    ok: true,
    status: 200,
    url: u,
    text: async () => fake.files[pathname]
  };
};

process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_testhost_secret";
process.env.BLOB_STORE_ID = "testhost";
delete process.env.VERCEL_OIDC_TOKEN;

function fail(msg) {
  console.error("FAIL " + msg);
  process.exitCode = 1;
}
function pass(msg) { console.log("ok  " + msg); }

function mockRes() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    send(b) { this.body = b; return this; },
    end() { return this; }
  };
}

async function call(handler, method, headers, body, query) {
  const res = mockRes();
  await handler({ method, headers: headers || {}, body: body || {}, query: query || {} }, res);
  return res;
}

function boot(storeFile) {
  process.env.AIA_STORE_PATH = storeFile;
  delete global.__aia;
  delete global.__aiaHydrate;
  Object.keys(require.cache).forEach((id) => {
    if (/\/api\/_lib\.js$|\/api\/auth\.js$|\/api\/health\.js$|\/api\/_desks-http\.js$|\/api\/_account/.test(id) || /\/api\/_plans\.js$/.test(id)) {
      delete require.cache[id];
    }
  });
  const lib = require("../api/_lib");
  const auth = require("../api/auth");
  return { lib, auth };
}

async function main() {
  const src = fs.readFileSync(path.join(__dirname, "..", "api/_lib.js"), "utf8");
  if (src.indexOf("blobOidcReady") < 0 || src.indexOf("VERCEL_OIDC_TOKEN") < 0) {
    fail("_lib must prefer OIDC+storeId and not override it with a static token");
  } else pass("_lib prefers OIDC over a static blob token");
  if (src.indexOf("blobHeadMeta") < 0 || src.indexOf("head") < 0) {
    fail("_lib must head() the blob store so a CDN get 403 is not a hard error");
  } else pass("_lib uses API head() before CDN get");
  if (src.indexOf("blobSeal") < 0 || src.indexOf("sealed-public") < 0) {
    fail("_lib must seal public fallback so aia/store.json is not world-readable plaintext");
  } else pass("_lib seals public fallback of aia/store.json");
  if (src.indexOf("blobPut(body, otherAccess)") >= 0) {
    fail("_lib must not put plaintext store JSON as public");
  } else pass("_lib does not put plaintext store JSON as public");
  if (src.indexOf("blobNeedsRetry") < 0 || src.indexOf("no blob credentials") < 0) {
    fail("_lib must retry token/REST when SDK says no blob credentials, not only on 403");
  } else pass("_lib retries token/REST on missing SDK credentials");
  if (src.indexOf("blobErrText") < 0 || src.indexOf("BLOB_STAMP") < 0 || src.indexOf("write-v1") < 0) {
    fail("_lib must fingerprint write-v1 and stringify nested blob errors");
  } else pass("_lib fingerprints write-v1 and stringifies nested blob errors");
  if (src.indexOf("publicBlobProbe") < 0 || src.indexOf("blobReady()") < 0) {
    fail("_lib must expose publicBlobProbe and blobReady so health can re-probe write");
  } else pass("_lib exposes publicBlobProbe and blobReady");
  const healthSrc = fs.readFileSync(path.join(__dirname, "..", "api/health.js"), "utf8");
  if (healthSrc.indexOf('mem.driver !== "blob"') >= 0) {
    fail("health must not skip the write probe when driver is already blob");
  } else pass("health re-probes write even when driver is already blob");
  if (src.indexOf('Buffer.from(blobSeal(body), "utf8")') < 0 || src.indexOf('"content-type": "application/json"') >= 0) {
    fail("_lib REST put must send a Buffer like upload.js, not a JSON content-type string");
  } else pass("_lib REST put sends a Buffer body like upload.js");
  if (src.indexOf("x-vercel-blob-store-id") < 0 || src.indexOf("vercel.com/api/blob/?pathname=") < 0) {
    fail("_lib REST put must send store id and use the blob control-plane pathname URL");
  } else pass("_lib REST put sends store id on the blob control-plane pathname URL");
  const yesNo = fs.readFileSync(path.join(__dirname, "..", "ACCOUNT-YES-NO.md"), "utf8");
  const packMd = fs.readFileSync(path.join(__dirname, "..", "PACK.md"), "utf8");
  if (yesNo.indexOf("Desks book leftover after blob 403 still") < 0) fail("ACCOUNT-YES-NO must name Desks book leftover after blob 403 still");
  else pass("ACCOUNT-YES-NO names Desks book leftover after blob 403 still");
  if (packMd.indexOf("Desks book leftover after blob 403 still") < 0) fail("PACK.md must name Desks book leftover after blob 403 still");
  else pass("PACK.md names Desks book leftover after blob 403 still");
  if (yesNo.indexOf("Health write leftover after put-v3") < 0) fail("ACCOUNT-YES-NO must name Health write leftover after put-v3");
  else pass("ACCOUNT-YES-NO names Health write leftover after put-v3");
  if (packMd.indexOf("Health write leftover after put-v3") < 0) fail("PACK.md must name Health write leftover after put-v3");
  else pass("PACK.md names Health write leftover after put-v3");

  const storeA = path.join(os.tmpdir(), "aia-blob-a-" + Date.now() + ".json");
  const { lib, auth } = boot(storeA);
  await lib.ready();
  if (fake.tokens.some((t) => t)) {
    fail("OIDC+storeId must not pass an explicit token, got " + JSON.stringify(fake.tokens.filter(Boolean)));
  } else pass("OIDC+storeId does not pass an explicit blob token");
  if (lib.blobProbe.read === "error" || lib.blobProbe.status === 403 || lib.blobProbe.auth !== "oidc") {
    fail("head 404 must not be CDN get 403 under OIDC, probe " + JSON.stringify(lib.blobProbe));
  } else pass("head 404 is empty-or-seeded under OIDC, not CDN get 403");
  if (lib.blobProbe.read !== "empty" && lib.mem.driver !== "blob") {
    fail("empty store must seed blob or stay empty, driver " + lib.mem.driver + " " + JSON.stringify(lib.blobProbe));
  } else pass("empty store hydrates without a read-error skip");

  const pin = "2468";
  const leftover = "deadbeefdeadbeefdeadbeefdeadbeef";
  const onboarded = await call(auth, "POST", { "x-workspace": "probe-desk", "x-pin": pin }, {
    action: "account",
    name: "Pat",
    biz: "probe-desk",
    slug: "probe-desk",
    pin
  });
  if (onboarded.statusCode !== 201 || !onboarded.body || !onboarded.body.session) {
    fail("Owner onboard should 201, got " + onboarded.statusCode + " " + JSON.stringify(onboarded.body));
  } else pass("Owner onboard writes the desk");
  if (lib.blobProbe.read !== "ok" || lib.mem.driver !== "blob" || lib.blobProbe.auth !== "oidc") {
    fail("onboard must stick after CDN get 403 when head/put work, probe " + JSON.stringify(lib.blobProbe) + " driver " + lib.mem.driver);
  } else pass("onboard sticks on blob after CDN get 403");
  if (fake.puts.some((a) => a === "public")) {
    fail("private store must not put aia/store.json as public, puts " + JSON.stringify(fake.puts));
  } else pass("private store puts stay private");

  const mineA = await call(auth, "POST", {
    "x-workspace": "probe-desk",
    "x-session": leftover,
    "x-pin": pin
  }, { action: "mine" }, { via: "desks" });
  if (mineA.statusCode !== 200 || !mineA.body || !(mineA.body.owned || mineA.body.desks)) {
    fail("instance A leftover+pin mine should 200, got " + mineA.statusCode + " " + JSON.stringify(mineA.body));
  } else pass("instance A leftover+pin mine 200");

  const storeB = path.join(os.tmpdir(), "aia-blob-b-" + Date.now() + ".json");
  const replica = boot(storeB);
  await replica.lib.ready();
  if (!(replica.lib.mem.workspaces || []).some((w) => w && w.slug === "probe-desk")) {
    fail("replica ready() must re-read the auth-created Owner desk from blob, got " + JSON.stringify((replica.lib.mem.workspaces || []).map((w) => w && w.slug)));
  } else pass("replica ready() re-reads the onboard Owner desk from blob");
  if (replica.lib.mem.driver !== "blob" || replica.lib.blobProbe.read !== "ok") {
    fail("replica health must be blob read ok, driver " + replica.lib.mem.driver + " " + JSON.stringify(replica.lib.blobProbe));
  } else pass("replica store driver is blob and read ok");
  process.env.VERCEL_GIT_COMMIT_SHA = "putv2testsha0001deadbeef";
  replica.lib.blobProbe.write = "fail";
  replica.lib.blobProbe.detail = null;
  const health = require("../api/health");
  const probed = await call(health, "GET");
  const finger = probed.body && probed.body.store && probed.body.store.blob;
  if (!finger || finger.stamp !== "write-v1") {
    fail("health must fingerprint stamp write-v1, got " + JSON.stringify(finger));
  } else pass("health fingerprints stamp write-v1");
  if (!finger || finger.rev !== "putv2testsha0001deadbeef") {
    fail("health must fingerprint rev from VERCEL_GIT_COMMIT_SHA, got " + JSON.stringify(finger));
  } else pass("health fingerprints rev from VERCEL_GIT_COMMIT_SHA");
  if (!finger || finger.write !== "ok" || !finger.detail || finger.detail === "[object Object]") {
    fail("health must re-probe write after leftover fail+null, got " + JSON.stringify(finger));
  } else pass("health re-probes write=ok with a string detail after leftover fail+null");
  if (finger.detail == null || String(finger.detail) === "null") {
    fail("health write detail must never be null, got " + JSON.stringify(finger));
  } else pass("health write detail is a real string");

  const mineB = await call(replica.auth, "POST", {
    "x-workspace": "probe-desk",
    "x-session": leftover,
    "x-pin": pin
  }, { action: "mine" }, { via: "desks" });
  const owned = (mineB.body && mineB.body.owned) || [];
  if (mineB.statusCode !== 200 || !owned.some((d) => d && d.slug === "probe-desk")) {
    fail("replica leftover+pin mine must paint owned desks, got " + mineB.statusCode + " " + JSON.stringify(mineB.body));
  } else pass("replica leftover+pin mine paints owned desks");

  const emptyPin = await call(replica.auth, "POST", {
    "x-workspace": "probe-desk",
    "x-session": leftover
  }, { action: "mine" }, { via: "desks" });
  if (emptyPin.statusCode !== 401) fail("empty pin must still 401 on replica mine, got " + emptyPin.statusCode);
  else pass("empty pin stays 401 on replica mine");

  const wrongPin = await call(replica.auth, "POST", {
    "x-workspace": "probe-desk",
    "x-session": leftover,
    "x-pin": "0000"
  }, { action: "mine" }, { via: "desks" });
  if (wrongPin.statusCode !== 401) fail("wrong pin must still 401 on replica mine, got " + wrongPin.statusCode);
  else pass("wrong pin stays 401 on replica mine");

  const getB = await call(replica.auth, "GET", {
    "x-workspace": "probe-desk",
    "x-session": leftover,
    "x-pin": pin
  }, {}, { via: "desks" });
  if (getB.statusCode !== 200 || !getB.body || !getB.body.desk || getB.body.desk.slug !== "probe-desk") {
    fail("replica GET /api/desks leftover+pin must see the Owner desk, got " + getB.statusCode + " " + JSON.stringify(getB.body));
  } else pass("replica GET /api/desks leftover+pin sees the Owner desk");

  const sealed = lib.blobSeal(JSON.stringify({ slug: "probe-desk", pin: "2468" }));
  let sealedJson;
  try { sealedJson = JSON.parse(sealed); } catch (e) { sealedJson = null; }
  if (!sealedJson || sealedJson.aia !== "aia-blob-1" || /2468/.test(sealed)) {
    fail("blobSeal must wrap PIN material, got " + String(sealed).slice(0, 120));
  } else pass("blobSeal wraps PIN material");
  if (lib.blobOpen(sealed).indexOf("probe-desk") < 0) fail("blobOpen must round-trip sealed store JSON");
  else pass("blobOpen round-trips sealed store JSON");

  fake.files = Object.create(null);
  fake.puts = [];
  fake.tokens = [];
  fake.forcePublic = true;
  fake.access = "public";
  const storeP = path.join(os.tmpdir(), "aia-blob-p-" + Date.now() + ".json");
  const pub = boot(storeP);
  const onboardP = await call(pub.auth, "POST", { "x-workspace": "probe-desk", "x-pin": pin }, {
    action: "account",
    name: "Pat",
    biz: "probe-desk",
    slug: "probe-desk",
    pin
  });
  if (onboardP.statusCode !== 201 || pub.lib.mem.driver !== "blob" || pub.lib.blobProbe.access !== "public") {
    fail("public store onboard must stick sealed, got " + onboardP.statusCode + " driver " + pub.lib.mem.driver + " " + JSON.stringify(pub.lib.blobProbe));
  } else pass("public store onboard sticks as sealed-public");
  const stored = fake.files[BLOB_KEY] || "";
  let storedJson = null;
  try { storedJson = JSON.parse(stored); } catch (e) { storedJson = null; }
  if (!storedJson || storedJson.aia !== "aia-blob-1" || storedJson.workspaces || /probe-desk/.test(stored)) {
    fail("public aia/store.json must be sealed, got " + stored.slice(0, 180));
  } else pass("public aia/store.json is sealed, not plaintext desks");
  const storeQ = path.join(os.tmpdir(), "aia-blob-q-" + Date.now() + ".json");
  const pubReplica = boot(storeQ);
  await pubReplica.lib.ready();
  const mineP = await call(pubReplica.auth, "POST", {
    "x-workspace": "probe-desk",
    "x-session": leftover,
    "x-pin": pin
  }, { action: "mine" }, { via: "desks" });
  const ownedP = (mineP.body && mineP.body.owned) || [];
  if (mineP.statusCode !== 200 || !ownedP.some((d) => d && d.slug === "probe-desk")) {
    fail("sealed public replica leftover+pin mine must paint owned desks, got " + mineP.statusCode + " " + JSON.stringify(mineP.body));
  } else pass("sealed public replica leftover+pin mine paints owned desks");
  const wrongP = await call(pubReplica.auth, "POST", {
    "x-workspace": "probe-desk",
    "x-session": leftover,
    "x-pin": "0000"
  }, { action: "mine" }, { via: "desks" });
  if (wrongP.statusCode !== 401) fail("wrong pin must still 401 on sealed public replica, got " + wrongP.statusCode);
  else pass("wrong pin stays 401 on sealed public replica");

  fake.files = Object.create(null);
  fake.puts = [];
  fake.tokens = [];
  fake.rests = [];
  fake.putBodies = [];
  fake.forcePublic = false;
  fake.sdkFail = true;
  fake.access = "private";
  fake.restPutErr = { error: { code: "store_mismatch", message: { why: "denied" } } };
  const storeFail = path.join(os.tmpdir(), "aia-blob-fail-" + Date.now() + ".json");
  const failed = boot(storeFail);
  await failed.lib.ready();
  await failed.lib.blobWrite();
  const failDetail = String(failed.lib.blobProbe.detail || "");
  if (failed.lib.blobProbe.write !== "fail") {
    fail("REST object error must mark write fail, probe " + JSON.stringify(failed.lib.blobProbe));
  } else if (failDetail.indexOf("[object Object]") >= 0) {
    fail("REST object error must not stringify to [object Object], got " + failDetail);
  } else if (failDetail.indexOf("denied") < 0 && failDetail.indexOf("store_mismatch") < 0) {
    fail("REST object error must keep a real API message, got " + failDetail);
  } else pass("REST object error detail is a real string, not [object Object]");
  fake.restPutErr = null;
  fake.files = Object.create(null);
  fake.puts = [];
  fake.tokens = [];
  fake.rests = [];
  fake.putBodies = [];
  fake.forcePublic = false;
  fake.sdkFail = true;
  fake.access = "private";
  const storeR = path.join(os.tmpdir(), "aia-blob-r-" + Date.now() + ".json");
  const rested = boot(storeR);
  const onboardR = await call(rested.auth, "POST", { "x-workspace": "probe-desk", "x-pin": pin }, {
    action: "account",
    name: "Pat",
    biz: "probe-desk",
    slug: "probe-desk",
    pin
  });
  if (onboardR.statusCode !== 201 || rested.lib.mem.driver !== "blob" || rested.lib.blobProbe.read !== "ok") {
    fail("SDK 403 must REST-stick onboard, got " + onboardR.statusCode + " driver " + rested.lib.mem.driver + " " + JSON.stringify(rested.lib.blobProbe));
  } else pass("SDK 403 REST-sticks onboard as driver blob read ok");
  const firstPut = fake.putBodies[0];
  if (!firstPut || !firstPut.isBuffer) {
    fail("REST put must send a Buffer body like upload.js, got " + JSON.stringify(firstPut));
  } else if (firstPut.headers && firstPut.headers["content-type"]) {
    fail("REST put must not send JSON content-type, headers " + JSON.stringify(firstPut.headers));
  } else if (!firstPut.headers || firstPut.headers["x-vercel-blob-store-id"] !== "testhost") {
    fail("REST put must send x-vercel-blob-store-id, headers " + JSON.stringify(firstPut && firstPut.headers));
  } else pass("REST put sends Buffer, store id, and no JSON content-type");
  const restStored = fake.files["aia-store.json"] || fake.files[BLOB_KEY] || "";
  let restJson = null;
  try { restJson = JSON.parse(restStored); } catch (e) { restJson = null; }
  if (!restJson || restJson.aia !== "aia-blob-1" || restJson.workspaces) {
    fail("REST aia/store.json must be sealed, got " + String(restStored).slice(0, 180));
  } else pass("REST aia/store.json is sealed, not plaintext desks");
  const storeS = path.join(os.tmpdir(), "aia-blob-s-" + Date.now() + ".json");
  const restReplica = boot(storeS);
  await restReplica.lib.ready();
  const mineR = await call(restReplica.auth, "POST", {
    "x-workspace": "probe-desk",
    "x-session": leftover,
    "x-pin": pin
  }, { action: "mine" }, { via: "desks" });
  const ownedR = (mineR.body && mineR.body.owned) || [];
  if (mineR.statusCode !== 200 || !ownedR.some((d) => d && d.slug === "probe-desk")) {
    fail("REST replica leftover+pin mine must paint owned desks, got " + mineR.statusCode + " " + JSON.stringify(mineR.body));
  } else pass("REST replica leftover+pin mine paints owned desks");
  const emptyR = await call(restReplica.auth, "POST", {
    "x-workspace": "probe-desk",
    "x-session": leftover
  }, { action: "mine" }, { via: "desks" });
  if (emptyR.statusCode !== 401) fail("empty pin must still 401 on REST replica, got " + emptyR.statusCode);
  else pass("empty pin stays 401 on REST replica");
  const wrongR = await call(restReplica.auth, "POST", {
    "x-workspace": "probe-desk",
    "x-session": leftover,
    "x-pin": "0000"
  }, { action: "mine" }, { via: "desks" });
  if (wrongR.statusCode !== 401) fail("wrong pin must still 401 on REST replica, got " + wrongR.statusCode);
  else pass("wrong pin stays 401 on REST replica");

  fake.files = Object.create(null);
  fake.puts = [];
  fake.tokens = [];
  fake.rests = [];
  fake.putBodies = [];
  fake.sdkFail = false;
  fake.sdkCreds = true;
  fake.forcePublic = false;
  const storeC = path.join(os.tmpdir(), "aia-blob-c-" + Date.now() + ".json");
  const creds = boot(storeC);
  const onboardC = await call(creds.auth, "POST", { "x-workspace": "probe-desk", "x-pin": pin }, {
    action: "account",
    name: "Pat",
    biz: "probe-desk",
    slug: "probe-desk",
    pin
  });
  if (onboardC.statusCode !== 201 || creds.lib.mem.driver !== "blob" || creds.lib.blobProbe.read !== "ok") {
    fail("SDK no-credentials must REST-stick onboard, got " + onboardC.statusCode + " driver " + creds.lib.mem.driver + " " + JSON.stringify(creds.lib.blobProbe));
  } else pass("SDK no-credentials REST-sticks onboard as driver blob read ok");
  const storeD = path.join(os.tmpdir(), "aia-blob-d-" + Date.now() + ".json");
  const credsReplica = boot(storeD);
  await credsReplica.lib.ready();
  const mineC = await call(credsReplica.auth, "POST", {
    "x-workspace": "probe-desk",
    "x-session": leftover,
    "x-pin": pin
  }, { action: "mine" }, { via: "desks" });
  const ownedC = (mineC.body && mineC.body.owned) || [];
  if (mineC.statusCode !== 200 || !ownedC.some((d) => d && d.slug === "probe-desk")) {
    fail("no-credentials replica leftover+pin mine must paint owned desks, got " + mineC.statusCode + " " + JSON.stringify(mineC.body));
  } else pass("no-credentials replica leftover+pin mine paints owned desks");
  const wrongC = await call(credsReplica.auth, "POST", {
    "x-workspace": "probe-desk",
    "x-session": leftover,
    "x-pin": "0000"
  }, { action: "mine" }, { via: "desks" });
  if (wrongC.statusCode !== 401) fail("wrong pin must still 401 after no-credentials REST, got " + wrongC.statusCode);
  else pass("wrong pin stays 401 after no-credentials REST");

  fake.files = Object.create(null);
  fake.puts = [];
  fake.tokens = [];
  fake.rests = [];
  fake.putBodies = [];
  fake.sdkFail = true;
  fake.sdkCreds = false;
  fake.forcePublic = false;
  fake.restPutErr = { error: { message: { code: "denied" } } };
  fake.restPutStatus = 403;
  const storeHealthFail = path.join(os.tmpdir(), "aia-blob-health-fail-" + Date.now() + ".json");
  boot(storeHealthFail);
  const healthFail = require("../api/health");
  const probedFail = await call(healthFail, "GET");
  const failFinger = probedFail.body && probedFail.body.store && probedFail.body.store.blob;
  if (!failFinger || failFinger.write !== "fail") {
    fail("health must report write=fail when PUT does not stick, got " + JSON.stringify(failFinger));
  } else pass("health reports write=fail when PUT does not stick");
  if (!failFinger || !failFinger.detail || failFinger.detail === "[object Object]" || failFinger.detail === "null") {
    fail("health fail detail must be a real string, got " + JSON.stringify(failFinger));
  } else pass("health fail detail is a real string, not null or [object Object]");

  if (process.exitCode) {
    console.error("check-blob-store failed");
    process.exit(1);
  }
  console.log("check-blob-store passed");
}

main().catch((err) => {
  fail(err && err.stack || String(err));
  console.error("check-blob-store failed");
  process.exit(1);
});
