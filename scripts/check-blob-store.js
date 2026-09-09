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
  tokens: []
};

function noteAuth(opts) {
  fake.tokens.push(opts && Object.prototype.hasOwnProperty.call(opts, "token") ? opts.token : undefined);
}

const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "@vercel/blob") {
    return {
      async get(key, opts) {
        const access = opts && opts.access;
        fake.gets.push(access);
        noteAuth(opts);
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

process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_testhost_secret";
process.env.BLOB_STORE_ID = "testhost";
process.env.VERCEL_OIDC_TOKEN = "eyJhbGciOiJoidc-test";

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
    if (/\/api\/_lib\.js$|\/api\/auth\.js$|\/api\/_desks-http\.js$|\/api\/_account/.test(id) || /\/api\/_plans\.js$/.test(id)) {
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
  if (src.indexOf("blobMayWrite") < 0 || src.indexOf("blobTryAuth") < 0) {
    fail("_lib must allow onboard put when CDN get 403s and retry token if OIDC 403s");
  } else pass("_lib may put onboard after CDN 403 and retries token if OIDC 403s");
  const yesNo = fs.readFileSync(path.join(__dirname, "..", "ACCOUNT-YES-NO.md"), "utf8");
  const packMd = fs.readFileSync(path.join(__dirname, "..", "PACK.md"), "utf8");
  if (yesNo.indexOf("Desks book leftover after blob 403 still") < 0) fail("ACCOUNT-YES-NO must name Desks book leftover after blob 403 still");
  else pass("ACCOUNT-YES-NO names Desks book leftover after blob 403 still");
  if (packMd.indexOf("Desks book leftover after blob 403 still") < 0) fail("PACK.md must name Desks book leftover after blob 403 still");
  else pass("PACK.md names Desks book leftover after blob 403 still");

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
